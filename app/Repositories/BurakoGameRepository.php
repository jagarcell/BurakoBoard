<?php

namespace App\Repositories;

use App\Models\BaseElement;
use App\Models\Game;
use App\Models\Player;
use App\Models\Round;
use App\Models\RoundDraft;
use App\Models\RoundScore;
use App\Models\Team;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class BurakoGameRepository
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
     * Return the existing games for dashboard selection.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Existing games ordered from newest to oldest.
     * Logic: fetch a lightweight ordered game list so the dashboard selector can render choices without assembling full score history payloads.
     */
    public function getGameList(): Collection
    {
        return Game::query()
            ->select([
                'id',
                'name',
                'target_points',
                'status',
                'winning_team_id',
                'current_round_number',
            ])
            ->orderByDesc('id')
            ->get();
    }

    /**
     * Create a global team (not bound to a specific game).
     *
     * @param  array<string, mixed>  $attributes  Team attributes including name.
     * @return \App\Models\Team The newly created global team.
     * Logic: persist a team row with only its name; membership in a game is handled
     * separately via the game_team pivot so the same team entity can participate in multiple games.
     */
    public function createTeam(array $attributes): Team
    {
        return Team::query()->create([
            'name' => $attributes['name'],
        ]);
    }

    /**
     * Attach an existing team to a game via the game_team pivot.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @return void Inserts the pivot row with current_score initialised to zero.
     * Logic: record membership without creating a new team entity; current_score starts at zero
     * for this game regardless of the team's history in other games.
     */
    public function attachTeamToGame(int $gameId, int $teamId): void
    {
        DB::table('game_team')->insertOrIgnore([
            'game_id' => $gameId,
            'team_id' => $teamId,
            'current_score' => 0,
        ]);
    }

    /**
     * Resolve a team by id globally, throwing 404 if it does not exist.
     *
     * @param  int  $teamId  Identifier of the team.
     * @return \App\Models\Team The matching team model.
     * Logic: perform a primary-key lookup on the teams table and raise a 404-style model
     * exception when missing; used by service methods that need to verify global team existence.
     */
    public function findTeamOrFail(int $teamId): Team
    {
        return Team::query()->findOrFail($teamId);
    }

    /**
     * Determine whether a team is already attached to a given game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @return bool True when a game_team pivot row exists for this pair.
     * Logic: query the game_team pivot for the exact (game_id, team_id) pair without touching the teams table.
     */
    public function isTeamAttachedToGame(int $gameId, int $teamId): bool
    {
        return DB::table('game_team')
            ->where('game_id', $gameId)
            ->where('team_id', $teamId)
            ->exists();
    }

    /**
     * Find a global team by its normalised, case-insensitive name.
     *
     * @param  string  $name  Name to look up; should already be normalised (trimmed, collapsed spaces).
     * @return \App\Models\Team|null The matching team or null when none exists.
     * Logic: use LOWER() on both sides so 'Team Alpha', 'team alpha', and 'TEAM ALPHA' all resolve
     * to the same record.
     */
    public function findTeamByNameGlobally(string $name): ?Team
    {
        return Team::query()
            ->whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->first();
    }

    /**
     * Resolve a team by id only when it is attached to the provided game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @return \App\Models\Team The matching team model.
     * Logic: verify team existence globally then confirm membership via the game_team pivot
     * to prevent cross-game writes; throws 404 if either check fails.
     */
    public function findTeamInGameOrFail(int $gameId, int $teamId): Team
    {
        $team = Team::query()->findOrFail($teamId);

        $inGame = DB::table('game_team')
            ->where('game_id', $gameId)
            ->where('team_id', $teamId)
            ->exists();

        if (! $inGame) {
            abort(404);
        }

        return $team;
    }

    /**
     * Create a standalone named player not linked to a user account.
     *
     * @param  string  $name  Display name for the player.
     * @return \App\Models\Player The created player model.
     * Logic: persist a player row with null user_id for guests/non-registered participants.
     */
    public function createNamedPlayer(string $name): Player
    {
        return Player::query()->create([
            'user_id' => null,
            'display_name' => $name,
        ]);
    }

    /**
     * Check whether a team already has a player whose display name matches the given name.
     *
     * @param  int     $teamId  Identifier of the team.
     * @param  string  $name    Player name to look up, already normalised.
     * @return bool True when a case-insensitive match exists in the team.
     * Logic: join team_player with players and compare LOWER(display_name) so that 'Carlos' and 'CARLOS' are treated as duplicates.
     */
    public function teamHasPlayerWithName(int $teamId, string $name): bool
    {
        return DB::table('team_player')
            ->join('players', 'players.id', '=', 'team_player.player_id')
            ->where('team_player.team_id', $teamId)
            ->whereRaw('LOWER(players.display_name) = ?', [strtolower($name)])
            ->exists();
    }

    /**
     * Resolve or create a player mapped to a registered user.
     *
     * @param  int  $userId  Identifier of the user account.
     * @param  string  $fallbackName  Name to store when creating the player record.
     * @return \App\Models\Player The existing or newly created player.
     * Logic: reuse the same player identity per user_id, creating it only once when first referenced.
     */
    public function findOrCreatePlayerFromUser(int $userId, string $fallbackName): Player
    {
        return Player::query()->firstOrCreate(
            ['user_id' => $userId],
            ['display_name' => $fallbackName]
        );
    }

    /**
     * Assign a player to a team only once.
     *
     * @param  int  $teamId  Identifier of the team.
     * @param  int  $playerId  Identifier of the player.
     * @return void Creates a team-player relation if missing.
     * Logic: perform idempotent pivot write so duplicate add-player calls do not create duplicate memberships.
     */
    public function attachPlayerToTeam(int $teamId, int $playerId): void
    {
        DB::table('team_player')->updateOrInsert(
            ['team_id' => $teamId, 'player_id' => $playerId],
            ['updated_at' => now(), 'created_at' => now()]
        );
    }

    /**
     * Return all player ids currently linked to a team.
     *
     * @param  int  $teamId  Identifier of the team.
     * @return \Illuminate\Support\Collection<int, int> Player ids in the team.
     * Logic: read team_player rows for the team and pluck player_id values so callers can perform
     * follow-up operations (such as seat assignment) without querying inside the service layer.
     */
    public function getTeamPlayerIds(int $teamId): Collection
    {
        return DB::table('team_player')
            ->where('team_id', $teamId)
            ->pluck('player_id')
            ->map(fn ($playerId): int => (int) $playerId);
    }

    /**
     * Remove a player from a team by deleting the team_player pivot row.
     *
     * @param  int  $teamId   Identifier of the team.
     * @param  int  $playerId Identifier of the player to remove.
     * @return void Deletes the pivot row; no-op if the association does not exist.
     * Logic: delete the team_player row for the given pair so the player no longer appears on the team roster.
     */
    public function detachPlayerFromTeam(int $teamId, int $playerId): void
    {
        DB::table('team_player')
            ->where('team_id', $teamId)
            ->where('player_id', $playerId)
            ->delete();
    }

    /**
     * Get all teams for a game ordered by team id, with current_score from the game_team pivot.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Support\Collection<int, object> Teams for the game with id, name, current_score.
     * Logic: join game_team and teams to return a per-game-scoped collection that includes
     * the current_score stored on the pivot rather than the (now-removed) teams.current_score column.
     */
    public function getTeamsForGame(int $gameId): Collection
    {
        return DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->where('game_team.game_id', $gameId)
            ->orderBy('teams.id')
            ->get(['teams.id', 'teams.name', 'game_team.current_score']);
    }

    /**
     * Determine whether a game already has exactly two teams assigned.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return bool True when the game has two or more team rows in the pivot, false otherwise.
     * Logic: count game_team rows scoped to the game and return true only when the count reaches two.
     */
    public function gameHasTwoTeams(int $gameId): bool
    {
        return DB::table('game_team')
            ->where('game_id', $gameId)
            ->count() >= 2;
    }

    /**
     * Calculate the next round number for a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return int The next round number.
     * Logic: read current max round_number for the game and increment by one.
     */
    public function getNextRoundNumber(int $gameId): int
    {
        $maxRound = Round::query()
            ->where('game_id', $gameId)
            ->max('round_number');

        return (int) $maxRound + 1;
    }

    /**
     * Create a round record for a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $roundNumber  Sequential round number.
     * @return \App\Models\Round The created round model.
     * Logic: persist one round header row that groups all team scores for the turn.
     */
    public function createRound(int $gameId, int $roundNumber): Round
    {
        return Round::query()->create([
            'game_id' => $gameId,
            'round_number' => $roundNumber,
        ]);
    }

    /**
     * Persist a score entry for one team inside a round.
     *
     * @param  int  $roundId  Identifier of the round.
     * @param  int  $teamId  Identifier of the team.
     * @param  int  $points  Points scored in this round.
     * @return \App\Models\RoundScore The created round score model.
     * Logic: create one round_scores record linking a team and points to the parent round.
     */
    public function createRoundScore(int $roundId, int $teamId, int $points): RoundScore
    {
        return RoundScore::query()->create([
            'round_id' => $roundId,
            'team_id' => $teamId,
            'points' => $points,
        ]);
    }

    /**
     * Increment and persist a team's running total within a game.
     *
     * @param  int  $gameId  Identifier of the game context.
     * @param  int  $teamId  Identifier of the team.
     * @param  int  $points  Delta to add to the running score.
     * @return object A stdClass row with id, name, and updated current_score from the pivot.
     * Logic: increment current_score on the game_team pivot for the specific (game, team) pair
     * and return a merged row so callers have the updated score for winner resolution.
     */
    public function incrementTeamScore(int $gameId, int $teamId, int $points): object
    {
        DB::table('game_team')
            ->where('game_id', $gameId)
            ->where('team_id', $teamId)
            ->increment('current_score', $points);

        return DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->where('game_team.game_id', $gameId)
            ->where('game_team.team_id', $teamId)
            ->selectRaw('teams.id, teams.name, game_team.current_score')
            ->first();
    }

    /**
     * Recompute a team's total score for a specific game by summing its round_scores rows.
     *
     * @param  int  $gameId  Identifier of the game context.
     * @param  int  $teamId  Identifier of the team.
     * @return int The authoritative cumulative score derived from the round history.
     * Logic: join round_scores through rounds filtered by game_id so only rounds that belong to
     * this game contribute to the total; persist the computed value back to game_team.current_score.
     */
    public function recomputeTeamScoreFromHistory(int $gameId, int $teamId): int
    {
        $total = (int) DB::table('round_scores')
            ->join('rounds', 'rounds.id', '=', 'round_scores.round_id')
            ->where('round_scores.team_id', $teamId)
            ->where('rounds.game_id', $gameId)
            ->sum('round_scores.points');

        DB::table('game_team')
            ->where('game_id', $gameId)
            ->where('team_id', $teamId)
            ->update(['current_score' => $total]);

        return $total;
    }

    /**
     * Recompute and persist current_score for every team in a game from round history.
     *
     * @param  int  $gameId  Identifier of the game whose team scores should be synced.
     * @return void Updates each game_team pivot row so current_score matches the sum of round_scores.
     * Logic: load all team ids for the game from game_team, then delegate each individual
     * recompute to recomputeTeamScoreFromHistory for a single source of truth.
     */
    public function syncTeamScoresForGame(int $gameId): void
    {
        $teamIds = DB::table('game_team')
            ->where('game_id', $gameId)
            ->pluck('team_id');

        foreach ($teamIds as $teamId) {
            $this->recomputeTeamScoreFromHistory($gameId, (int) $teamId);
        }
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
        $game->status = 'finished';
        $game->winning_team_id = $winningTeamId;
        $game->current_round_number = $roundNumber;
        $game->save();

        return $game;
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
     * Return all registered users ordered by name for player selection.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\User> Users ordered alphabetically by name.
     * Logic: fetch a minimal id-and-name user list so team creation dialogs can present registered player candidates without loading full profile data.
     */
    public function getUserList(): Collection
    {
        return User::query()
            ->select(['id', 'name'])
            ->orderBy('name')
            ->get();
    }

    /**
     * Find a seated player in the context of a specific game.
     *
     * @param  int  $gameId    Identifier of the game.
     * @param  int  $playerId  Identifier of the player.
     * @return object|null A row containing player identity and seat info, or null when missing.
     * Logic: join game_team, team_player, players, and game_player_seat to ensure the player
     * belongs to one of the game's teams and has a concrete seat assignment in that game.
     */
    public function findSeatedPlayerInGame(int $gameId, int $playerId): ?object
    {
        return DB::table('game_team')
            ->join('team_player', 'team_player.team_id', '=', 'game_team.team_id')
            ->join('players', 'players.id', '=', 'team_player.player_id')
            ->join('game_player_seat', function ($join) use ($gameId): void {
                $join->on('game_player_seat.player_id', '=', 'players.id')
                    ->where('game_player_seat.game_id', '=', $gameId);
            })
            ->where('game_team.game_id', $gameId)
            ->where('players.id', $playerId)
            ->select([
                'players.id as player_id',
                'players.display_name',
                'game_player_seat.seat_number',
            ])
            ->first();
    }

    /**
     * Return all available base scoring elements ordered by id.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\BaseElement> All base elements ordered by id.
     * Logic: fetch the full base_elements catalogue ordered by id so the round scoring form can render
     * the correct input controls (checkbox for boolean, number input for quantity) with their point values,
     * penalty deduction, and mutual-exclusivity flag.
     */
    public function getBaseElements(): Collection
    {
        return BaseElement::query()
            ->select(['id', 'name', 'label', 'points', 'penalty', 'input_type', 'mutually_exclusive', 'score_override'])
            ->orderBy('id')
            ->get();
    }

    /**
     * Return all teams across all games with their players eager-loaded.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Team> All teams ordered from newest to oldest with players loaded.
     * Logic: fetch every team with players pre-loaded to avoid N+1 queries when rendering the team selector.
     */
    public function getAllTeams(): Collection
    {
        return Team::query()
            ->select(['id', 'name'])
            ->with('players')
            ->orderByDesc('id')
            ->get();
    }

    /**
     * Update a team's name in place.
     *
     * @param  \App\Models\Team  $team  Team model to update.
     * @param  array<string, mixed>  $attributes  Attributes to persist; expects a 'name' key.
     * @return \App\Models\Team The refreshed team after the update.
     * Logic: apply the attribute change and reload the record so callers receive the latest persisted state.
     */
    public function updateTeam(Team $team, array $attributes): Team
    {
        $team->update(['name' => $attributes['name']]);

        return $team->fresh();
    }

    /**
     * Build a full game summary including teams, players, and round history.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return array<string, mixed> Structured summary payload for API output.
     * Logic: compose a read model by joining game_team → teams for current_score, team memberships,
     * and round scores, then map them into the API resource structure.
     */
    public function getGameSummary(int $gameId): array
    {
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

        $roundRows = DB::table('round_scores')
            ->join('rounds', 'rounds.id', '=', 'round_scores.round_id')
            ->join('teams', 'teams.id', '=', 'round_scores.team_id')
            ->where('rounds.game_id', $gameId)
            ->orderBy('rounds.round_number')
            ->orderBy('teams.id')
            ->get([
                'rounds.round_number',
                'round_scores.team_id',
                'teams.name as team_name',
                'round_scores.points',
            ]);

        $rounds = $roundRows
            ->groupBy('round_number')
            ->map(function (Collection $scores, int|string $roundNumber): array {
                return [
                    'round_number' => (int) $roundNumber,
                    'scores' => $scores->map(fn ($score): array => [
                        'team_id' => (int) $score->team_id,
                        'team_name' => $score->team_name,
                        'points' => (int) $score->points,
                    ])->values()->all(),
                ];
            })
            ->values()
            ->all();

        $teamPayload = $teams->map(function ($team) use ($playersByTeam): array {
            $teamPlayers = $playersByTeam->get($team->id, collect())
                ->map(fn ($player): array => [
                    'id' => (int) $player->player_id,
                    'user_id' => $player->user_id === null ? null : (int) $player->user_id,
                    'display_name' => $player->display_name,
                    'seat_number' => $player->seat_number !== null ? (int) $player->seat_number : null,
                ])
                ->values()
                ->all();

            return [
                'id' => (int) $team->id,
                'name' => $team->name,
                'current_score' => (int) $team->current_score,
                'players' => $teamPlayers,
            ];
        })->values()->all();

        $roundRoles = $this->buildRoundRoles(
            $teamPayload,
            (int) $game->current_round_number,
            $game->initial_shuffler_seat_number !== null ? (int) $game->initial_shuffler_seat_number : null,
        );

        return [
            'game' => [
                'id' => $game->id,
                'name' => $game->name,
                'target_points' => $game->target_points,
                'status' => $game->status,
                'winning_team_id' => $game->winning_team_id,
                'current_round_number' => $game->current_round_number,
                'initial_shuffler_seat_number' => $game->initial_shuffler_seat_number,
            ],
            'teams' => $teamPayload,
            'rounds' => $rounds,
            'round_roles' => $roundRoles,
        ];
    }

    /**
     * Compute seat-based round roles (shuffler, cutter, dealer, first draw) for each played and upcoming round.
     *
     * @param  array<int, array<string, mixed>>  $teams  Team payload with players that include seat numbers.
     * @param  int  $currentRoundNumber  Last completed round number from the game row.
     * @param  int|null  $initialShufflerSeatNumber  Seat number selected as the initial shuffler.
     * @return array<int, array<string, mixed>> Round role assignments ordered by round number.
     * Logic: flatten seated players ordered by seat, locate the initial shuffler index, then rotate
     * indices by one seat each round so cutter is next seat, dealer is the seat after cutter, and first draw is the seat after dealer.
     */
    private function buildRoundRoles(array $teams, int $currentRoundNumber, ?int $initialShufflerSeatNumber): array
    {
        $seatedPlayers = collect($teams)
            ->flatMap(fn (array $team): array => $team['players'] ?? [])
            ->filter(fn (array $player): bool => $player['seat_number'] !== null)
            ->sortBy('seat_number')
            ->values();

        if ($initialShufflerSeatNumber === null || $seatedPlayers->count() < 4) {
            return [];
        }

        $initialIndex = $seatedPlayers->search(
            fn (array $player): bool => (int) $player['seat_number'] === $initialShufflerSeatNumber,
        );

        if ($initialIndex === false) {
            return [];
        }

        $roundCount = max(1, $currentRoundNumber + 1);
        $totalPlayers = $seatedPlayers->count();
        $roundRoles = [];

        for ($roundOffset = 0; $roundOffset < $roundCount; $roundOffset++) {
            $shuffler = $seatedPlayers[($initialIndex + $roundOffset) % $totalPlayers];
            $cutter = $seatedPlayers[($initialIndex + $roundOffset + 1) % $totalPlayers];
            $dealer = $seatedPlayers[($initialIndex + $roundOffset + 2) % $totalPlayers];
            $firstDraw = $seatedPlayers[($initialIndex + $roundOffset + 3) % $totalPlayers];

            $roundRoles[] = [
                'round_number' => $roundOffset + 1,
                'shuffler' => [
                    'player_id' => (int) $shuffler['id'],
                    'display_name' => $shuffler['display_name'],
                    'seat_number' => (int) $shuffler['seat_number'],
                ],
                'cutter' => [
                    'player_id' => (int) $cutter['id'],
                    'display_name' => $cutter['display_name'],
                    'seat_number' => (int) $cutter['seat_number'],
                ],
                'dealer' => [
                    'player_id' => (int) $dealer['id'],
                    'display_name' => $dealer['display_name'],
                    'seat_number' => (int) $dealer['seat_number'],
                ],
                'first_draw' => [
                    'player_id' => (int) $firstDraw['id'],
                    'display_name' => $firstDraw['display_name'],
                    'seat_number' => (int) $firstDraw['seat_number'],
                ],
            ];
        }

        return $roundRoles;
    }

    /**
     * Retrieve the round draft for a game, if one exists.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \App\Models\RoundDraft|null The draft or null if none has been saved yet.
     * Logic: look up a single draft row by game_id and return it, letting callers
     * decide what to do when no draft exists yet.
     */
    public function getRoundDraft(int $gameId): ?RoundDraft
    {
        return RoundDraft::query()
            ->where('game_id', $gameId)
            ->where('round_number', 0)
            ->first();
    }

    /**
     * Retrieve the archived draft for a specific completed round.
     *
     * @param  int  $gameId      Identifier of the game.
     * @param  int  $roundNumber The round whose archived draft should be retrieved.
     * @return \App\Models\RoundDraft|null The archived draft or null if none was captured.
     * Logic: look up the draft row by game_id and round_number; a positive round_number
     * indicates a draft that was archived when that round was committed.
     */
    public function getRoundDraftForRound(int $gameId, int $roundNumber): ?RoundDraft
    {
        return RoundDraft::query()
            ->where('game_id', $gameId)
            ->where('round_number', $roundNumber)
            ->first();
    }

    /**
     * Create or update the round draft for a game.
     *
     * @param  int  $gameId      Identifier of the game.
     * @param  array<string, mixed>  $baseInputs  Per-team element values keyed by team ID then element ID.
     * @param  array<string, mixed>  $cardInputs  Per-team card counts keyed by team ID.
     * @return \App\Models\RoundDraft The created or updated draft.
     * Logic: use updateOrCreate to respect the unique index on game_id, then return the
     * fresh record so callers always see the persisted state.
     */
    public function upsertRoundDraft(int $gameId, array $baseInputs, array $cardInputs): RoundDraft
    {
        $draft = RoundDraft::query()->updateOrCreate(
            ['game_id' => $gameId, 'round_number' => 0],
            ['base_inputs' => $baseInputs, 'card_inputs' => $cardInputs],
        );

        return $draft->fresh();
    }

    /**
     * Archive the active draft for a game by assigning it the committed round number.
     *
     * @param  int  $gameId      Identifier of the game whose active draft should be archived.
     * @param  int  $roundNumber The round number just committed; applied to the active draft row.
     * @return void
     * Logic: update the active draft row (round_number = 0) to the committed round number so
     * it can be retrieved later as a historical scoring breakdown for that specific round.
     * If no active draft exists the operation is a silent no-op.
     */
    public function archiveRoundDraft(int $gameId, int $roundNumber): void
    {
        RoundDraft::query()
            ->where('game_id', $gameId)
            ->where('round_number', 0)
            ->update(['round_number' => $roundNumber]);
    }

    /**
     * Delete the round draft for a game.
     *
     * @param  int  $gameId  Identifier of the game whose draft should be removed.
     * @return void
     * Logic: remove the draft row by game_id so stale inputs are not presented
     * to the user after a round has been successfully recorded.
     */
    public function deleteRoundDraft(int $gameId): void
    {
        RoundDraft::query()
            ->where('game_id', $gameId)
            ->where('round_number', 0)
            ->delete();
    }

    /**
     * Compute and persist the seat number for a player joining a team in a game.
     *
     * @param  int  $gameId    Identifier of the game.
     * @param  int  $teamId    Identifier of the team the player is joining.
     * @param  int  $playerId  Identifier of the player being seated.
     * @return void Inserts or replaces the player's seat assignment for this game.
     * Logic:
     *   1. Determine the team's slot (0 = first team by id, 1 = second team by id) within the game
     *      by ordering game_team rows by teams.id ascending.
     *   2. Count how many players from this team already have a seat in this game to establish
     *      the next position.
     *   3. Compute: slot 0 → position * 2 + 1 (odd, 1 3 5…); slot 1 → position * 2 + 2 (even, 2 4 6…).
     *   4. Insert the row, ignoring duplicates to keep the operation idempotent.
     */
    public function assignPlayerSeat(int $gameId, int $teamId, int $playerId): void
    {
        $teamIds = DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->where('game_team.game_id', $gameId)
            ->orderBy('teams.id')
            ->pluck('teams.id');

        $slot = $teamIds->search($teamId);

        // If the team is not part of this game, skip silently.
        if ($slot === false) {
            return;
        }

        // Count already-seated players for this team in this game.
        $existingCount = DB::table('game_player_seat')
            ->join('team_player', 'team_player.player_id', '=', 'game_player_seat.player_id')
            ->where('game_player_seat.game_id', $gameId)
            ->where('team_player.team_id', $teamId)
            ->count();

        $seatNumber = $slot === 0
            ? $existingCount * 2 + 1
            : $existingCount * 2 + 2;

        DB::table('game_player_seat')->insertOrIgnore([
            'game_id'     => $gameId,
            'player_id'   => $playerId,
            'seat_number' => $seatNumber,
        ]);
    }

    /**
     * Remove the seat assignment for a player across all games where the given team participates.
     *
     * @param  int  $teamId    Identifier of the team the player is being removed from.
     * @param  int  $playerId  Identifier of the player whose seats should be cleared.
     * @return void Deletes seat rows for every game that includes this team.
     * Logic: since team_player membership is not game-scoped, removing a player from a team
     * implies removing them from every game where that team plays; deleting all matching
     * game_player_seat rows keeps seat data consistent with the team roster.
     */
    public function removePlayerSeatForTeam(int $teamId, int $playerId): void
    {
        $gameIds = DB::table('game_team')
            ->where('team_id', $teamId)
            ->pluck('game_id');

        DB::table('game_player_seat')
            ->whereIn('game_id', $gameIds)
            ->where('player_id', $playerId)
            ->delete();
    }
}
