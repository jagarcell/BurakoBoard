<?php

namespace App\Services;

use App\Enums\GameStatus;
use App\Events\GameUpdated;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Repositories\GameRepository;
use App\Repositories\RoundDraftRepository;
use App\Repositories\RoundRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class RoundService
{
    /**
     * Construct the service with round-recording repository dependencies.
     *
     * @param  \App\Repositories\GameRepository       $gameRepository       Needed for game status guards, cutter update, and summary broadcast.
     * @param  \App\Repositories\TeamRepository       $teamRepository       Needed to validate team coverage and update team scores.
     * @param  \App\Repositories\RoundRepository      $roundRepository      Handles Round and RoundScore creation.
     * @param  \App\Repositories\RoundDraftRepository $roundDraftRepository Needed to archive active draft after round commit.
     * @param  \App\Repositories\SeatRepository       $seatRepository       Needed for seated-player lookup in setInitialShuffler.
     * @return void
     * Logic: inject only the repositories required for round-recording concerns owned by this service.
     */
    public function __construct(
        private readonly GameRepository $gameRepository,
        private readonly TeamRepository $teamRepository,
        private readonly RoundRepository $roundRepository,
        private readonly RoundDraftRepository $roundDraftRepository,
        private readonly SeatRepository $seatRepository,
    ) {
    }

    /**
     * Set the initial cutter by selecting one seated player in the game.
     *
     * @param  int  $gameId    Identifier of the game.
     * @param  int  $playerId  Identifier of the selected cutter player.
     * @return array<string, mixed> Updated game summary payload.
     * Logic: enforce in-progress and pre-round constraints, validate the selected player is seated
     *   in the game, persist that player's seat as the initial cutter anchor, then broadcast and return summary.
     */
    public function setInitialShuffler(int $gameId, int $playerId): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot set cutter for a finished game.',
            ]);
        }

        if ((int) $game->current_round_number > 0) {
            throw ValidationException::withMessages([
                'game' => 'Initial cutter can only be set before recording the first round.',
            ]);
        }

        $seatedPlayer = $this->seatRepository->findSeatedPlayerInGame($gameId, $playerId);

        if ($seatedPlayer === null) {
            throw ValidationException::withMessages([
                'player_id' => 'Selected player must belong to this game and have a seat.',
            ]);
        }

        $this->gameRepository->updateGameInitialShufflerSeat($game, (int) $seatedPlayer->seat_number);

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Record scores for one game round and update running totals.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  array<string, mixed>  $payload  Validated round score payload.
     * @return array<string, mixed> Game summary payload after recording the round.
     * Logic: validate full team coverage, persist round and per-team points in a transaction,
     *   update totals, close game on winner, then archive the active draft under the committed
     *   round number so it can later be retrieved as a read-only scoring breakdown.
     */
    public function recordRound(int $gameId, array $payload): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot record rounds for a finished game.',
            ]);
        }

        $scores       = collect($payload['scores']);
        $teams        = $this->teamRepository->getTeamsForGame($gameId);
        $teamIds      = $teams->pluck('id');
        $inputTeamIds = $scores->pluck('team_id');

        if ($teamIds->count() < 2) {
            throw ValidationException::withMessages([
                'scores' => 'At least two teams are required before recording rounds.',
            ]);
        }

        if ($inputTeamIds->sort()->values()->all() !== $teamIds->sort()->values()->all()) {
            throw ValidationException::withMessages([
                'scores' => 'Round scores must include every team in the game exactly once.',
            ]);
        }

        $committedRoundNumber = 0;

        try {
            DB::transaction(function () use ($game, $gameId, $scores, &$committedRoundNumber): void {
                $roundNumber = $this->roundRepository->getNextRoundNumber($gameId);
                $round       = $this->roundRepository->createRound($gameId, $roundNumber);
                $committedRoundNumber = $roundNumber;

                $updatedTeams = collect();

                foreach ($scores as $score) {
                    $team   = $this->teamRepository->findTeamInGameOrFail($gameId, (int) $score['team_id']);
                    $points = (int) $score['points'];

                    $this->roundRepository->createRoundScore($round->id, $team->id, $points);
                    $updatedTeam = $this->teamRepository->incrementTeamScore($gameId, $team->id, $points);
                    $updatedTeams->push($updatedTeam);
                }

                $winner = $this->resolveWinner($updatedTeams, (int) $game->target_points);

                if ($winner !== null) {
                    $this->gameRepository->finishGameWithWinner($game, $winner->id, $round->round_number);

                    return;
                }

                $this->gameRepository->updateGameRoundCounter($game, $round->round_number);
            });
        } catch (QueryException $e) {
            Log::error('DB transaction failed in recordRound', [
                'game_id'  => $gameId,
                'sql'      => $e->getSql(),
                'bindings' => $e->getBindings(),
                'message'  => $e->getMessage(),
                'user_id'  => auth()->id(),
            ]);
            throw ValidationException::withMessages([
                'round' => ['The round could not be saved due to a database error. Please try again.'],
            ]);
        }

        Log::info('Round recorded', [
            'game_id'      => $gameId,
            'round_number' => $committedRoundNumber,
        ]);

        // Archive the active draft under the committed round number so it can be
        // retrieved later as a read-only scoring breakdown for that round.
        $this->roundDraftRepository->archiveRoundDraft($gameId, $committedRoundNumber);

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Recompute and persist current_score for every team in a game from its round history.
     *
     * @param  int  $gameId  Identifier of the game whose team scores need syncing.
     * @return void
     * Logic: act as an orchestration entry point for score repair, ensuring service callers never
     *   touch the repository directly.
     */
    public function syncGameScores(int $gameId): void
    {
        $this->teamRepository->syncTeamScoresForGame($gameId);
    }

    /**
     * Resolve the winner based on target points and highest current score.
     *
     * @param  \Illuminate\Support\Collection<int, object>  $teams  Score rows updated after the round (stdClass with id, name, current_score).
     * @param  int  $targetPoints  Winning threshold configured for the game.
     * @return object|null The winning team row or null when no team reached target.
     * Logic: filter teams that reached target, rank by highest score with deterministic id tiebreaker, and return first match.
     */
    private function resolveWinner(Collection $teams, int $targetPoints): ?object
    {
        return $teams
            ->filter(fn (object $team): bool => $team->current_score >= $targetPoints)
            ->sortBy([
                ['current_score', 'desc'],
                ['id', 'asc'],
            ])
            ->first();
    }

    /**
     * Assemble the authoritative summary, broadcast it to other channel members, and return it.
     *
     * @param  int  $gameId  Identifier of the game that was mutated.
     * @return array<string, mixed> The refreshed game summary.
     * Logic: assemble the authoritative summary once, dispatch a GameUpdated event to every
     *   other authenticated member of the private game channel so their UI reflects the change
     *   without requiring a page reload, then return the summary to the HTTP layer.
     */
    private function broadcastAndReturn(int $gameId): array
    {
        $this->gameRepository->forgetGameSummaryCache($gameId);
        $data = $this->gameRepository->getGameSummary($gameId);
        $summary = (new GameSummaryResource($data))->resolve();

        broadcast(new GameUpdated($gameId, $summary))->toOthers();

        return $summary;
    }
}
