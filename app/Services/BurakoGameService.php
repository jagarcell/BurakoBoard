<?php

namespace App\Services;

use App\Models\Game;
use App\Models\Player;
use App\Models\RoundDraft;
use App\Models\Team;
use App\Repositories\BurakoGameRepository;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BurakoGameService
{
    /**
     * Construct the service with repository dependency.
     *
     * @param  \App\Repositories\BurakoGameRepository  $repository  Repository that handles all persistence operations.
     * @return void Initializes the service dependency used by all orchestration methods.
     * Logic: inject one repository so services stay free of inline queries and delegate persistence consistently.
     */
    public function __construct(private readonly BurakoGameRepository $repository)
    {
    }

    /**
     * Return the existing games for dashboard selection.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Existing games ordered for selector display.
     * Logic: delegate the lightweight game listing query to the repository so the dashboard can populate its selector without loading full summaries.
     */
    public function listGames(): Collection
    {
        return $this->repository->getGameList();
    }

    /**
     * Create a new game in progress.
     *
     * @param  array<string, mixed>  $payload  Validated game data with name and target points.
     * @return array<string, mixed> Game summary payload.
     * Logic: persist a game with default status and round counters, then return a normalized summary payload.
     */
    public function createGame(array $payload): array
    {
        $game = $this->repository->createGame([
            'name' => $payload['name'],
            'target_points' => (int) $payload['target_points'],
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        return $this->repository->getGameSummary($game->id);
    }

    /**
     * Update an existing game's name and target points.
     *
     * @param  int  $gameId  Identifier of the game to update.
     * @param  array<string, mixed>  $payload  Validated data with new name and target_points.
     * @return \App\Models\Game The updated game model.
     * Logic: forward the sanitized payload to the repository and return the refreshed model for caller serialization.
     */
    public function updateGame(int $gameId, array $payload): Game
    {
        return $this->repository->updateGame($gameId, [
            'name' => $payload['name'],
            'target_points' => (int) $payload['target_points'],
        ]);
    }

    /**
     * Return all registered users available for player assignment.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\User> Registered users ordered by name.
     * Logic: delegate user list retrieval to the repository so the team creation dialog has a stable source of registered player candidates.
     */
    public function listUsers(): Collection
    {
        return $this->repository->getUserList();
    }

    /**
     * Return all available base scoring elements.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\BaseElement> All base elements ordered by id.
     * Logic: delegate the base element retrieval to the repository so the controller can obtain the scoring
     * catalogue without direct query coupling.
     */
    public function listBaseElements(): Collection
    {
        return $this->repository->getBaseElements();
    }

    /**
     * Return all teams with their players for the team selector.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Team> All teams with players loaded.
     * Logic: delegate the all-teams query to the repository so the frontend team selector can present previously used teams.
     */
    public function listTeams(): Collection
    {
        return $this->repository->getAllTeams();
    }

    /**
     * Add a new team to an existing game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  array<string, mixed>  $payload  Validated team data.
     * @return array<string, mixed> Game summary payload after team creation.
     * Logic: enforce that only in-progress games can receive teams, create the team, then return refreshed summary data.
     */
    public function addTeam(int $gameId, array $payload): array
    {
        $game = $this->repository->findGameOrFail($gameId);

        if ($game->status !== 'in_progress') {
            throw ValidationException::withMessages([
                'game' => 'Cannot add teams to a finished game.',
            ]);
        }

        $this->repository->createTeam($gameId, [
            'name' => $payload['name'],
        ]);

        return $this->repository->getGameSummary($gameId);
    }

    /**
     * Update the name of an existing team within a game.
     *
     * @param  int  $gameId  Identifier of the game owning the team.
     * @param  int  $teamId  Identifier of the team to update.
     * @param  array<string, mixed>  $payload  Validated team data containing the new name.
     * @return array<string, mixed> Game summary payload after the update.
     * Logic: enforce game status, resolve the team within the game, update its name, then return the refreshed summary.
     */
    public function updateTeam(int $gameId, int $teamId, array $payload): array
    {
        $game = $this->repository->findGameOrFail($gameId);

        if ($game->status !== 'in_progress') {
            throw ValidationException::withMessages([
                'game' => 'Cannot update teams in a finished game.',
            ]);
        }

        $team = $this->repository->findTeamInGameOrFail($gameId, $teamId);
        $this->repository->updateTeam($team, $payload);

        return $this->repository->getGameSummary($gameId);
    }

    /**
     * Add a player to a team either by free-form name or by registered user id.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @param  array<string, mixed>  $payload  Validated player input.
     * @return array<string, mixed> Game summary payload after player assignment.
     * Logic: block writes on finished games, reject duplicate player names within the team using a
     * case-insensitive normalised comparison, resolve player source (name or user), attach once to the team, then reload summary.
     */
    public function addPlayerToTeam(int $gameId, int $teamId, array $payload): array
    {
        $game = $this->repository->findGameOrFail($gameId);

        if ($game->status !== 'in_progress') {
            throw ValidationException::withMessages([
                'game' => 'Cannot add players to a finished game.',
            ]);
        }

        $team = $this->repository->findTeamInGameOrFail($gameId, $teamId);

        $incomingName = $payload['name'] ?? null;

        if ($incomingName !== null && $this->repository->teamHasPlayerWithName($team->id, $incomingName)) {
            throw ValidationException::withMessages([
                'name' => 'A player with this name already exists in this team.',
            ]);
        }

        $player = $this->resolvePlayerForPayload($payload);

        $this->repository->attachPlayerToTeam($team->id, $player->id);

        return $this->repository->getGameSummary($gameId);
    }

    /**
     * Record scores for one game round and update running totals.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  array<string, mixed>  $payload  Validated round score payload.
     * @return array<string, mixed> Game summary payload after recording the round.
     * Logic: validate full team coverage, persist round and per-team points in a transaction,
     * update totals, close game on winner, then archive the active draft under the committed
     * round number so it can later be retrieved as a read-only scoring breakdown.
     */
    public function recordRound(int $gameId, array $payload): array
    {
        $game = $this->repository->findGameOrFail($gameId);

        if ($game->status !== 'in_progress') {
            throw ValidationException::withMessages([
                'game' => 'Cannot record rounds for a finished game.',
            ]);
        }

        $scores = collect($payload['scores']);
        $teams = $this->repository->getTeamsForGame($gameId);
        $teamIds = $teams->pluck('id');
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

        DB::transaction(function () use ($game, $gameId, $scores, &$committedRoundNumber): void {
            $roundNumber = $this->repository->getNextRoundNumber($gameId);
            $round = $this->repository->createRound($gameId, $roundNumber);
            $committedRoundNumber = $roundNumber;

            $updatedTeams = collect();

            foreach ($scores as $score) {
                $team = $this->repository->findTeamInGameOrFail($gameId, (int) $score['team_id']);
                $points = (int) $score['points'];

                $this->repository->createRoundScore($round->id, $team->id, $points);
                $updatedTeam = $this->repository->incrementTeamScore($team, $points);
                $updatedTeams->push($updatedTeam);
            }

            $winner = $this->resolveWinner($updatedTeams, (int) $game->target_points);

            if ($winner !== null) {
                $this->repository->finishGameWithWinner($game, $winner->id, $round->round_number);

                return;
            }

            $this->repository->updateGameRoundCounter($game, $round->round_number);
        });

        // Archive the active draft under the committed round number so it can be
        // retrieved later as a read-only scoring breakdown for that round.
        $this->repository->archiveRoundDraft($gameId, $committedRoundNumber);

        return $this->repository->getGameSummary($gameId);
    }

    /**
     * Return the latest scoreboard and round history for a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return array<string, mixed> Full game summary payload.
     * Logic: delegate read-model assembly to the repository to provide one consistent API response shape.
     */
    public function getGameSummary(int $gameId): array
    {
        return $this->repository->getGameSummary($gameId);
    }

    /**
     * Recompute and persist current_score for every team in a game from its round history.
     *
     * @param  int  $gameId  Identifier of the game whose team scores need syncing.
     * @return void Delegates recompute to the repository so each team's stored score matches the sum of its round_scores.
     * Logic: act as an orchestration entry point for score repair, ensuring service callers never touch the repository directly.
     */
    public function syncGameScores(int $gameId): void
    {
        $this->repository->syncTeamScoresForGame($gameId);
    }

    /**
     * Build a player model from payload rules.
     *
     * @param  array<string, mixed>  $payload  Validated player payload containing either user_id or name.
     * @return \App\Models\Player The resolved player model.
     * Logic: reuse existing player record for registered users, otherwise create an ad-hoc named player entry.
     */
    /**
     * Return the current round draft for a game, or null if none exists.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \App\Models\RoundDraft|null The draft or null if no draft has been saved yet.
     * Logic: confirm the game exists before delegating the lookup to the repository
     * so unknown game IDs raise a 404 rather than returning a silent null.
     */
    public function getRoundDraft(int $gameId): ?RoundDraft
    {
        $this->repository->findGameOrFail($gameId);

        return $this->repository->getRoundDraft($gameId);
    }

    /**
     * Return the archived draft captured when a specific round was committed.
     *
     * @param  int  $gameId      Identifier of the game.
     * @param  int  $roundNumber The round number whose draft should be retrieved.
     * @return \App\Models\RoundDraft|null The archived draft or null if none was captured for that round.
     * Logic: confirm the game exists so unknown game IDs raise a 404 rather than a silent null,
     * then delegate the lookup to the repository using the composite (game_id, round_number) key.
     */
    public function getRoundDraftForRound(int $gameId, int $roundNumber): ?RoundDraft
    {
        $this->repository->findGameOrFail($gameId);

        return $this->repository->getRoundDraftForRound($gameId, $roundNumber);
    }

    /**
     * Create or update the round draft for a game with the provided input values.
     *
     * @param  int  $gameId   Identifier of the game.
     * @param  array<string, mixed>  $payload  Validated payload containing base_inputs and card_inputs.
     * @return \App\Models\RoundDraft The created or updated draft.
     * Logic: verify the game exists and is still in progress, then delegate persistence
     * to the repository, maintaining the one-draft-per-game invariant.
     */
    public function saveRoundDraft(int $gameId, array $payload): RoundDraft
    {
        $game = $this->repository->findGameOrFail($gameId);

        if ($game->status !== 'in_progress') {
            throw ValidationException::withMessages([
                'game' => 'Cannot save a draft for a finished game.',
            ]);
        }

        return $this->repository->upsertRoundDraft(
            $gameId,
            $payload['base_inputs'] ?? [],
            $payload['card_inputs'] ?? [],
        );
    }

    /**
     * Build a player model from payload rules.
     *
     * @param  array<string, mixed>  $payload  Validated player payload containing either user_id or name.
     * @return \App\Models\Player The resolved player model.
     * Logic: reuse existing player record for registered users, otherwise create an ad-hoc named player entry.
     */
    private function resolvePlayerForPayload(array $payload): Player
    {
        $userId = $payload['user_id'] ?? null;

        if ($userId !== null) {
            return $this->repository->findOrCreatePlayerFromUser(
                (int) $userId,
                (string) ($payload['name'] ?? 'Registered Player')
            );
        }

        return $this->repository->createNamedPlayer((string) $payload['name']);
    }

    /**
     * Resolve the winner based on target points and highest current score.
     *
     * @param  \Illuminate\Support\Collection<int, \App\Models\Team>  $teams  Teams updated after the round.
     * @param  int  $targetPoints  Winning threshold configured for the game.
     * @return \App\Models\Team|null The winning team or null when no team reached target.
     * Logic: filter teams that reached target, rank by highest score with deterministic id tiebreaker, and return first match.
     */
    private function resolveWinner(Collection $teams, int $targetPoints): ?Team
    {
        return $teams
            ->filter(fn (Team $team): bool => $team->current_score >= $targetPoints)
            ->sortBy([
                ['current_score', 'desc'],
                ['id', 'asc'],
            ])
            ->first();
    }
}
