<?php

namespace App\Repositories;

use App\Data\GameSummaryData;
use App\Enums\GameStatus;
use App\Enums\GameUserRole;
use App\Models\BaseElement;
use App\Models\Game;
use App\Models\Round;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class GameRepository
{
    /**
     * Persist a new game record.
     *
     * @param  array<string, mixed>  $attributes  Game attributes including name and target points.
     * @return \App\Models\Game The newly created game.
     * Logic: issue one create operation on the games model and return the hydrated record.
     */
    public function createGame(array $attributes): Game
    {
        return Game::query()->create($attributes);
    }

    /**
     * Resolve a game by id or fail.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \App\Models\Game The matching game model.
     * Logic: perform a primary-key lookup and raise a 404-style model exception when missing.
     */
    public function findGameOrFail(int $gameId): Game
    {
        return Game::query()->findOrFail($gameId);
    }

    /**
     * Return the games linked to a specific user for dashboard selection.
     *
     * @param  int  $userId  Identifier of the authenticated user.
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Games the user has access to (excluding pending invitations), ordered from newest to oldest.
     * Logic: join the game_user pivot to filter to only the games the given user is enrolled in,
     *   exclude rows where the user's role is still pending_invitee, and surface the user's role
     *   for each game as the `user_role` attribute. A correlated EXISTS subquery populates
     *   `has_rematch` so the frontend can suppress the rematch button when a successor game already
     *   exists for a finished game.
     */
    public function getGameList(int $userId): Collection
    {
        return Game::query()
            ->join('game_user', 'game_user.game_id', '=', 'games.id')
            ->where('game_user.user_id', $userId)
            ->where('game_user.role', '!=', GameUserRole::PendingInvitee->value)
            ->select([
                'games.id',
                'games.name',
                'games.target_points',
                'games.status',
                'games.winning_team_id',
                'games.rematch_from_game_id',
                'games.current_round_number',
                'game_user.role as user_role',
                DB::raw('EXISTS(SELECT 1 FROM games AS g2 WHERE g2.rematch_from_game_id = games.id) AS has_rematch'),
            ])
            ->orderByDesc('games.id')
            ->get();
    }

    /**
     * Update an existing game's name and target points.
     *
     * @param  int  $gameId  Identifier of the game to update.
     * @param  array<string, mixed>  $attributes  Attributes to persist on the game record.
     * @return \App\Models\Game The updated game model with refreshed attributes.
     * Logic: resolve the game or throw 404, apply the attribute update, and return the freshly loaded record.
     */
    public function updateGame(int $gameId, array $attributes): Game
    {
        $game = $this->findGameOrFail($gameId);
        $game->update($attributes);

        return $game->fresh();
    }

    /**
     * Update the initial shuffler seat used to derive round roles.
     *
     * @param  \App\Models\Game  $game  Game to update.
     * @param  int  $seatNumber  Seat number of the initial shuffler.
     * @return \App\Models\Game The refreshed game model after persistence.
     * Logic: persist one seat reference on the game so round role rotation can be computed
     * deterministically from seat order without storing role rows per round.
     */
    public function updateGameInitialShufflerSeat(Game $game, int $seatNumber): Game
    {
        $game->initial_shuffler_seat_number = $seatNumber;
        $game->save();

        return $game->fresh();
    }

    /**
     * Update only the game's current round counter.
     *
     * @param  \App\Models\Game  $game  Game to update.
     * @param  int  $roundNumber  Latest completed round.
     * @return \App\Models\Game The updated game model.
     * Logic: persist the latest completed round when no winner is reached yet.
     */
    public function updateGameRoundCounter(Game $game, int $roundNumber): Game
    {
        $game->current_round_number = $roundNumber;
        $game->save();

        return $game;
    }

    /**
     * Mark a game as finished with a winner and round number.
     *
     * @param  \App\Models\Game  $game  Game to update.
     * @param  int  $winningTeamId  Identifier of the winning team.
     * @param  int  $roundNumber  Last played round number.
     * @return \App\Models\Game The updated game model.
     * Logic: set terminal state fields atomically on the game row after winner resolution.
     */
    public function finishGameWithWinner(Game $game, int $winningTeamId, int $roundNumber): Game
    {
        $game->status = GameStatus::Finished;
        $game->winning_team_id = $winningTeamId;
        $game->current_round_number = $roundNumber;
        $game->save();

        return $game;
    }

    /**
     * Permanently remove a game record and let the database cascade to all related rows.
     *
     * @param  int  $gameId  Identifier of the game to delete.
     * @return void
     * Logic: issue a single delete on the games table; all dependent tables are set up with
     *   cascadeOnDelete foreign keys so the database handles cleanup automatically.
     */
    public function deleteGame(int $gameId): void
    {
        Game::query()->where('id', $gameId)->delete();
    }

    /**
     * Link a user to a game with a given role in the game_user pivot table.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $userId  Identifier of the user to link.
     * @param  string  $role  Role assigned to the user: creator, pending_invitee, or viewer.
     * @return void
     * Logic: insert a single pivot row with a role and timestamps.
     */
    public function attachUserToGame(int $gameId, int $userId, string $role): void
    {
        DB::table('game_user')->insert([
            'game_id'    => $gameId,
            'user_id'    => $userId,
            'role'       => $role,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Return a single game with the requesting user's role attached.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $userId  Identifier of the authenticated user.
     * @return \App\Models\Game The game model with a user_role attribute set from the pivot.
     * Logic: join game_user for the specific (game_id, user_id) pair and surface the role as
     *   user_role so callers can serialize a GameListItemResource without a separate query.
     */
    public function getGameWithUserRole(int $gameId, int $userId): Game
    {
        return Game::query()
            ->join('game_user', 'game_user.game_id', '=', 'games.id')
            ->where('games.id', $gameId)
            ->where('game_user.user_id', $userId)
            ->select([
                'games.id',
                'games.name',
                'games.target_points',
                'games.status',
                'games.winning_team_id',
                'games.rematch_from_game_id',
                'games.current_round_number',
                'game_user.role as user_role',
            ])
            ->firstOrFail();
    }

    /**
     * Check whether a user holds the creator role for a given game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $userId  Identifier of the user.
     * @return bool True when the game_user pivot has a creator row for this pair.
     * Logic: query the game_user pivot for the exact (game_id, user_id, role=creator) tuple
     *   without hydrating a model, since only a boolean result is needed.
     */
    public function isGameCreator(int $gameId, int $userId): bool
    {
        return DB::table('game_user')
            ->where('game_id', $gameId)
            ->where('user_id', $userId)
            ->where('role', GameUserRole::Creator->value)
            ->exists();
    }

    /**
     * Determine whether a game has any recorded rounds.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return bool True when at least one round row is linked to this game.
     * Logic: perform an existence check on the rounds table filtered by game_id;
     *   used to guard the delete operation so games with history are never removed.
     */
    public function gameHasRounds(int $gameId): bool
    {
        return Round::query()->where('game_id', $gameId)->exists();
    }

    /**
     * Return all available base scoring elements ordered by id.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\BaseElement> All base elements ordered by id.
     * Logic: fetch the full base_elements catalogue ordered by id so the round scoring form can render
     * the correct input controls with their point values, penalty deduction, and mutual-exclusivity flag.
     */
    public function getBaseElements(): Collection
    {
        return Cache::remember('base_elements', now()->addDay(), fn (): Collection =>
            BaseElement::query()
                ->select(['id', 'name', 'label', 'points', 'penalty', 'input_type', 'mutually_exclusive', 'score_override'])
                ->orderBy('id')
                ->get()
        );
    }

    /**
     * Collect all games that belong to the same rematch chain as the given game.
     *
     * @param  int  $gameId  Identifier of any game in the chain.
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> All games in the chain ordered by id ascending.
     * Logic:
     *   1. Walk the rematch_from_game_id pointer upward from the given game until a root
     *      game with no parent is reached, collecting the root's id.
     *   2. From the root, collect all descendants by following the rematch_from_game_id FK
     *      downward using a recursive CTE so a single query retrieves the entire chain.
     *   3. Hydrate each row as a lightweight Game model and attach a team_scores array
     *      (each entry: team_id, team_name, current_score) fetched via a join on game_team
     *      and teams so the presenter layer can render per-team final scores without an
     *      additional round-trip.
     */
    public function getRematchChain(int $gameId): Collection
    {
        // Walk up to the root game id using individual lookups (chain is typically short).
        $rootId = $gameId;
        $visited = [];

        while (true) {
            if (in_array($rootId, $visited, true)) {
                break; // Guard against circular references.
            }

            $visited[] = $rootId;

            $parentId = DB::table('games')
                ->where('id', $rootId)
                ->value('rematch_from_game_id');

            if ($parentId === null) {
                break;
            }

            $rootId = (int) $parentId;
        }

        // Fetch all descendants of the root (inclusive) via recursive CTE.
        $rows = DB::select(
            "WITH RECURSIVE chain AS (
                SELECT id, name, target_points, status, winning_team_id,
                       rematch_from_game_id, current_round_number
                FROM games
                WHERE id = ?
                UNION ALL
                SELECT g.id, g.name, g.target_points, g.status, g.winning_team_id,
                       g.rematch_from_game_id, g.current_round_number
                FROM games g
                INNER JOIN chain c ON g.rematch_from_game_id = c.id
            )
            SELECT * FROM chain ORDER BY id ASC",
            [$rootId]
        );

        // Batch-load team scores for all collected games in a single query.
        $gameIds = collect($rows)->pluck('id')->all();

        $teamScoresByGame = DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->whereIn('game_team.game_id', $gameIds)
            ->select([
                'game_team.game_id',
                'game_team.team_id',
                'teams.name as team_name',
                'game_team.current_score',
            ])
            ->get()
            ->groupBy('game_id');

        return collect($rows)->map(function (object $row) use ($teamScoresByGame): Game {
            $game = new Game();
            $game->id                   = $row->id;
            $game->name                 = $row->name;
            $game->target_points        = $row->target_points;
            $game->status               = $row->status;
            $game->winning_team_id      = $row->winning_team_id;
            $game->rematch_from_game_id = $row->rematch_from_game_id;
            $game->current_round_number = $row->current_round_number;
            $game->team_scores          = ($teamScoresByGame->get($row->id) ?? collect())->values()->all();

            return $game;
        });
    }

    /**
     * Invalidate the cached game summary for a game after any write operation.
     *
     * @param  int  $gameId  Identifier of the game whose cache entry should be removed.
     * @return void
     * Logic: remove the key written by getGameSummary so the next call re-queries the database
     *   and caches the fresh result. Must be called by every broadcastAndReturn path before
     *   getGameSummary is invoked.
     */
    public function forgetGameSummaryCache(int $gameId): void
    {
        Cache::forget("game_summary:{$gameId}");
    }

    /**
     * Build a raw game summary data object containing the query results needed for presentation.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \App\Data\GameSummaryData Raw query results wrapped in a value object for the resource layer.
     * Logic:
     *   1. Wrap the entire assembly in a short-lived cache keyed by game_id (TTL 10 s) to eliminate
     *      the duplicate fetch that occurs when both the HTTP response and the WebSocket broadcast
     *      need the same data within a single request cycle.
     *   2. Count total rounds first; then limit the round_scores query to the last N rounds
     *      (config game.summary_round_limit, default 50) so the query stays O(N) regardless of
     *      game history length. The total count is forwarded to GameSummaryData so the resource
     *      layer can publish has_more_rounds without an additional query.
     *   3. All array assembly and domain logic is delegated to GameSummaryResource and
     *      RoundRoleCalculator.
     */
    public function getGameSummary(int $gameId): GameSummaryData
    {
        return Cache::remember("game_summary:{$gameId}", 10, function () use ($gameId): GameSummaryData {
            $game = $this->findGameOrFail($gameId);

            $teams = DB::table('game_team')
                ->join('teams', 'teams.id', '=', 'game_team.team_id')
                ->where('game_team.game_id', $gameId)
                ->orderBy('teams.id')
                ->get(['teams.id', 'teams.name', 'game_team.current_score']);

            $playersByTeam = DB::table('team_player')
                ->join('players', 'players.id', '=', 'team_player.player_id')
                ->leftJoin('game_player_seat', function ($join) use ($gameId): void {
                    $join->on('game_player_seat.player_id', '=', 'players.id')
                        ->where('game_player_seat.game_id', '=', $gameId);
                })
                ->whereIn('team_player.team_id', $teams->pluck('id')->all())
                ->orderByRaw('COALESCE(game_player_seat.seat_number, 999999)')
                ->orderBy('players.id')
                ->get([
                    'team_player.team_id',
                    'players.id as player_id',
                    'players.user_id',
                    'players.display_name',
                    'game_player_seat.seat_number',
                ])
                ->groupBy('team_id');

            $limit = (int) config('game.summary_round_limit', 50);

            $totalRounds = DB::table('rounds')
                ->where('game_id', $gameId)
                ->count();

            $roundIds = DB::table('rounds')
                ->select('id')
                ->where('game_id', $gameId)
                ->orderByDesc('round_number')
                ->limit($limit)
                ->pluck('id')
                ->all();

            $roundRows = DB::table('round_scores')
                ->join('rounds', 'rounds.id', '=', 'round_scores.round_id')
                ->join('teams', 'teams.id', '=', 'round_scores.team_id')
                ->whereIn('round_scores.round_id', $roundIds)
                ->orderBy('rounds.round_number')
                ->orderBy('teams.id')
                ->get([
                    'rounds.round_number',
                    'round_scores.team_id',
                    'teams.name as team_name',
                    'round_scores.points',
                ]);

            return new GameSummaryData($game, $teams, $playersByTeam, $roundRows, $totalRounds);
        });
    }

    /**
     * Fetch a page of round-score rows strictly before a given round number.
     *
     * @param  int  $gameId       Identifier of the game.
     * @param  int  $beforeRound  Return only rounds with round_number < this value.
     * @param  int  $limit        Maximum number of rounds to return.
     * @return array{items: list<array{round_number: int, scores: list<array{team_id: int, team_name: string, points: int}>}>, has_more: bool}
     * Logic: select the last $limit rounds whose round_number is strictly less than $beforeRound,
     *   ordered descending to get the most-recent batch, then reverse to ascending order for
     *   consistent client rendering. A has_more flag is derived by checking whether the total
     *   older-round count exceeds the requested limit.
     */
    public function getRoundsPage(int $gameId, int $beforeRound, int $limit): array
    {
        $totalOlder = DB::table('rounds')
            ->where('game_id', $gameId)
            ->where('round_number', '<', $beforeRound)
            ->count();

        $roundIds = DB::table('rounds')
            ->select('id')
            ->where('game_id', $gameId)
            ->where('round_number', '<', $beforeRound)
            ->orderByDesc('round_number')
            ->limit($limit)
            ->pluck('id')
            ->all();

        $rows = DB::table('round_scores')
            ->join('rounds', 'rounds.id', '=', 'round_scores.round_id')
            ->join('teams', 'teams.id', '=', 'round_scores.team_id')
            ->whereIn('round_scores.round_id', $roundIds)
            ->orderBy('rounds.round_number')
            ->orderBy('teams.id')
            ->get([
                'rounds.round_number',
                'round_scores.team_id',
                'teams.name as team_name',
                'round_scores.points',
            ]);

        $items = $rows
            ->groupBy('round_number')
            ->map(fn ($scores, $roundNumber): array => [
                'round_number' => (int) $roundNumber,
                'scores'       => $scores->map(fn ($s): array => [
                    'team_id'   => (int) $s->team_id,
                    'team_name' => $s->team_name,
                    'points'    => (int) $s->points,
                ])->values()->all(),
            ])
            ->values()
            ->all();

        return [
            'items'    => $items,
            'has_more' => $totalOlder > $limit,
        ];
    }
}
