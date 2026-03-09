<?php

namespace App\Services;

use App\Models\Game;
use App\Models\Player;
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
     * Add a player to a team either by free-form name or by registered user id.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @param  array<string, mixed>  $payload  Validated player input.
     * @return array<string, mixed> Game summary payload after player assignment.
     * Logic: block writes on finished games, resolve player source (name or user), attach once to the team, then reload summary.
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
     * Logic: validate full team coverage, persist round and per-team points in a transaction, update totals, and close game on winner.
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

        DB::transaction(function () use ($game, $gameId, $scores): void {
            $roundNumber = $this->repository->getNextRoundNumber($gameId);
            $round = $this->repository->createRound($gameId, $roundNumber);

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
