<?php

namespace App\Repositories;

use App\Enums\GameStatus;
use App\Enums\GameUserRole;
use App\Models\BaseElement;
use App\Models\Game;
use App\Models\Player;
use App\Models\Round;
use App\Models\RoundDraft;
use App\Models\RoundScore;
use App\Models\Team;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\ModelNotFoundException;
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
     * Return the games linked to a specific user for dashboard selection.
     *
     * @param  int  $userId  Identifier of the authenticated user.
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Games the user has access to (excluding pending invitations), ordered from newest to oldest.
     * Logic: join the game_user pivot to filter to only the games the given user is enrolled in,
     *   exclude rows where the user's role is still pending_invitee (those are surfaced exclusively
     *   through the notification bell endpoint), and surface the user's role for each game as the
     *   `user_role` attribute so the dashboard selector can render a descriptive role indicator
     *   without extra queries.
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
                'games.current_round_number',
                'game_user.role as user_role',
            ])
            ->orderByDesc('games.id')
            ->get();
    }

    /**
     * Return only the games for which the given user holds a pending_invitee role.
     *
     * @param  int  $userId  Identifier of the authenticated user.
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Games where the user has a pending invitation, newest first.
     * Logic: join the game_user pivot and filter to rows where user_id matches and role is
     *   pending_invitee, selecting only the columns needed to render an invitation card in the
     *   bell popup, ordered newest first so the most recent invitation appears at the top.
     */
    public function getPendingInvitations(int $userId): Collection
    {
        return Game::query()
            ->join('game_user', 'game_user.game_id', '=', 'games.id')
            ->where('game_user.user_id', $userId)
            ->where('game_user.role', GameUserRole::PendingInvitee->value)
            ->select([
                'games.id',
                'games.name',
                'games.target_points',
                'games.status',
                'games.winning_team_id',
                'games.current_round_number',
                'game_user.role as user_role',
            ])
            ->orderByDesc('games.id')
            ->get();
    }

    /**
     * Determine whether a user has at least one pending game invitation.
     *
     * @param  int  $userId  Identifier of the authenticated user.
     * @return bool True when the user has one or more pending_invitee rows in game_user.
     * Logic: issues a single EXISTS query on the game_user pivot filtered by user_id and the
     *   pending_invitee role; uses DB::table() because no model hydration is required for a
     *   boolean existence check.
     */
    public function hasPendingInvitations(int $userId): bool
    {
        return DB::table('game_user')
            ->where('user_id', $userId)
            ->where('role', GameUserRole::PendingInvitee->value)
            ->exists();
    }

    /**
     * Link a user to a game with a given role in the game_user pivot table.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $userId  Identifier of the user to link.
     * @param  string  $role  Role assigned to the user: creator, pending_invitee, or viewer.
     * @return void
     * Logic: insert a single pivot row with a role and timestamps; DB::table() is used here
     *   because no model hydration is needed for a straightforward pivot insert.
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
            throw new ModelNotFoundException("Team [{$teamId}] is not attached to Game [{$gameId}].");
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
            ->lockForUpdate()
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
        $game->status = GameStatus::Finished;
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
     * Return a paginated list of users eligible to receive a viewer invite for a game.
     *
     * @param  int  $gameId         Identifier of the game for which invites would be sent.
     * @param  int  $excludeUserId  Identifier of the authenticated user who must not appear in the list.
     * @param  int  $page           1-based page number requested by the caller.
     * @param  int  $perPage        Number of records per page.
     * @return \Illuminate\Contracts\Pagination\LengthAwarePaginator<\App\Models\User> Paginated users ordered alphabetically by name.
     * Logic: exclude the authenticated user and any user that already holds a pending_invitee
     *   entry on the game_user pivot for this specific game, then paginate the remaining
     *   users alphabetically so the invite dialog can render an incrementally-loadable list.
     */
    public function getInvitableUsersForGame(int $gameId, int $excludeUserId, int $page, int $perPage): LengthAwarePaginator
    {
        return User::query()
            ->select(['users.id', 'users.name'])
            ->where('users.id', '!=', $excludeUserId)
            ->whereNotIn('users.id', function ($subquery) use ($gameId): void {
                $subquery->select('user_id')
                    ->from('game_user')
                    ->where('game_id', $gameId)
                    ->where('role', GameUserRole::PendingInvitee->value);
            })
            ->orderBy('users.name')
            ->paginate($perPage, ['*'], 'page', $page);
    }

    /**
     * Return a collection of User models for a given set of IDs.
     *
     * @param  array<int>  $userIds  IDs of the users to load.
     * @return \Illuminate\Support\Collection<int, \App\Models\User> Matched users with id, name, and email.
     * Logic: fetch only the columns needed for mail dispatch; using `whereIn` keeps the query
     *   to a single round-trip regardless of how many IDs are supplied.
     */
    public function getUsersByIds(array $userIds): Collection
    {
        return User::query()
            ->select(['id', 'name', 'email'])
            ->whereIn('id', $userIds)
            ->get();
    }

    /**
     * Insert pending-invitee pivot rows for multiple users in a single database round-trip.
     *
     * @param  int          $gameId   Identifier of the game.
     * @param  array<int>   $userIds  IDs of the users being invited.
     * @return void
     * Logic: build an insert batch with a `pending_invitee` role and current timestamps for every
     *   supplied user ID. Users already present in the game_user pivot for this game are excluded
     *   before calling this method (handled at the service layer) to avoid composite-primary-key
     *   violations.
     */
    public function bulkAttachPendingInviteesToGame(int $gameId, array $userIds): void
    {
        $now  = now();
        $rows = array_map(
            static fn (int $userId): array => [
                'game_id'    => $gameId,
                'user_id'    => $userId,
                'role'       => GameUserRole::PendingInvitee->value,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            $userIds,
        );

        DB::table('game_user')->insert($rows);
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
     * Compute seat-based round roles (cutter, dealer, first draw) for each played and upcoming round.
     *
     * @param  array<int, array<string, mixed>>  $teams  Team payload with players that include seat numbers.
     * @param  int  $currentRoundNumber  Last completed round number from the game row.
     * @param  int|null  $initialShufflerSeatNumber  Seat number selected as the initial cutter anchor.
     * @return array<int, array<string, mixed>> Round role assignments ordered by round number.
     * Logic: flatten seated players ordered by seat, locate the anchor index, then rotate
     * indices by one seat each round so dealer is the next seat and first draw is the seat after dealer.
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
            $cutter = $seatedPlayers[($initialIndex + $roundOffset) % $totalPlayers];
            $dealer = $seatedPlayers[($initialIndex + $roundOffset + 1) % $totalPlayers];
            $firstDraw = $seatedPlayers[($initialIndex + $roundOffset + 2) % $totalPlayers];

            $roundRoles[] = [
                'round_number' => $roundOffset + 1,
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
     * Delete all seat assignments for a game and recompute them from scratch.
     *
     * @param  int  $gameId  Identifier of the game whose seats should be re-derived.
     * @return void Replaces all game_player_seat rows using the canonical slot order.
     *
     * Logic: Clear existing seat rows for the game, then iterate teams in ascending teams.id order
     * (slot 0 = lowest id, slot 1 = second lowest id). Within each team, iterate players in ascending
     * player.id order to derive their position index. Seat formula: slot 0 → position * 2 + 1 (odd
     * seats 1, 3, 5…); slot 1 → position * 2 + 2 (even seats 2, 4, 6…). A full re-seat is required
     * to guarantee correctness when a team with a lower id is attached after a team with a higher id
     * already has seats, because the slot-index of the existing team changes when the new team is
     * inserted into the ordered list.
     */
    public function reassignAllSeatsForGame(int $gameId): void
    {
        DB::table('game_player_seat')
            ->where('game_id', $gameId)
            ->delete();

        $teamIds = DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->where('game_team.game_id', $gameId)
            ->orderBy('teams.id')
            ->pluck('teams.id');

        foreach ($teamIds as $slot => $teamId) {
            $playerIds = DB::table('team_player')
                ->where('team_id', $teamId)
                ->orderBy('player_id')
                ->pluck('player_id');

            foreach ($playerIds as $position => $playerId) {
                $seatNumber = $slot === 0
                    ? $position * 2 + 1
                    : $position * 2 + 2;

                DB::table('game_player_seat')->insert([
                    'game_id'     => $gameId,
                    'player_id'   => (int) $playerId,
                    'seat_number' => $seatNumber,
                ]);
            }
        }
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

    /**
     * Swap the seat numbers of two players within a single game atomically.
     *
     * @param  int  $gameId     Identifier of the game in which the swap takes place.
     * @param  int  $playerIdA  Identifier of the first player.
     * @param  int  $playerIdB  Identifier of the second player.
     * @return void Updates both rows so each player holds the other's original seat number.
     * Logic: reads both current seat numbers, then performs the swap inside a DB transaction
     * using a temporary seat value of 0 to avoid violating the unique(game_id, seat_number)
     * constraint during the intermediate state. Seats start at 1, so 0 is safe as a transient value.
     */
    public function swapPlayerSeats(int $gameId, int $playerIdA, int $playerIdB): void
    {
        DB::transaction(function () use ($gameId, $playerIdA, $playerIdB): void {
            $seatA = DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdA)
                ->value('seat_number');

            $seatB = DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdB)
                ->value('seat_number');

            if ($seatA === null || $seatB === null) {
                return;
            }

            // Step through a temporary seat (0) to avoid the unique-constraint conflict.
            DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdA)
                ->update(['seat_number' => 0]);

            DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdB)
                ->update(['seat_number' => $seatA]);

            DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdA)
                ->update(['seat_number' => $seatB]);
        });
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
     * Atomically create a new rematch game from a source game within a DB transaction.
     *
     * @param  int  $sourceGameId  Identifier of the finished source game.
     * @param  array<string, mixed>  $attributes  Game attributes for the new game (name, target_points, status, etc.).
     * @param  int  $userId  Identifier of the user to attach as creator.
     * @return int The id of the newly created game.
     * Logic: wrap all operations in a DB transaction so a failure in any step rolls back the entire
     * set. Steps: (1) create the game record, (2) attach the creator pivot row, (3) attach the same
     * teams from the source game in ascending team-id order, (4) copy seat rows from the source game,
     * (5) set initial_shuffler_seat_number to the next cutter rotation seat when derivable.
     */
    public function createRematchGame(int $sourceGameId, array $attributes, int $userId): int
    {
        return DB::transaction(function () use ($sourceGameId, $attributes, $userId): int {
            $newGame = $this->createGame($attributes);

            $this->attachUserToGame($newGame->id, $userId, GameUserRole::Creator->value);

            $teamIds = DB::table('game_team')
                ->join('teams', 'teams.id', '=', 'game_team.team_id')
                ->where('game_team.game_id', $sourceGameId)
                ->orderBy('teams.id')
                ->pluck('teams.id');

            foreach ($teamIds as $teamId) {
                $this->attachTeamToGame($newGame->id, (int) $teamId);
            }

            $this->copySeatsFromGame($sourceGameId, $newGame->id);

            $nextCutterSeat = $this->computeNextCutterSeatNumber($sourceGameId);

            if ($nextCutterSeat !== null) {
                $newGame->initial_shuffler_seat_number = $nextCutterSeat;
                $newGame->save();
            }

            return $newGame->id;
        });
    }

    /**
     * Copy all game_player_seat rows from a source game into a newly created game.
     *
     * @param  int  $sourceGameId  Identifier of the finished game to copy seats from.
     * @param  int  $newGameId  Identifier of the freshly created rematch game.
     * @return void Inserts one seat row per player in the new game matching the source seat assignments.
     * Logic: select every game_player_seat row belonging to the source game and bulk-insert
     * equivalent rows for the new game, preserving player_id and seat_number so the player
     * order is identical to the source game. This is done in a single query to minimise
     * round-trips and keep the operation atomic within the caller's transaction.
     */
    public function copySeatsFromGame(int $sourceGameId, int $newGameId): void
    {
        $rows = DB::table('game_player_seat')
            ->where('game_id', $sourceGameId)
            ->get(['player_id', 'seat_number'])
            ->map(fn (object $row): array => [
                'game_id'     => $newGameId,
                'player_id'   => (int) $row->player_id,
                'seat_number' => (int) $row->seat_number,
            ])
            ->all();

        if (! empty($rows)) {
            DB::table('game_player_seat')->insert($rows);
        }
    }

    /**
     * Compute the seat number of the player who would be cutter in the next round of a finished game.
     *
     * @param  int  $gameId  Identifier of the finished game.
     * @return int|null The seat number of the next cutter, or null when roles cannot be determined.
     * Logic: load the initial_shuffler_seat_number and current_round_number from the game,
     * then collect all seated players for the game sorted by seat_number. The next cutter
     * is the player at index (initialIndex + currentRoundNumber) % totalPlayers, which is
     * exactly one rotation beyond the last played round's cutter.
     */
    public function computeNextCutterSeatNumber(int $gameId): ?int
    {
        $game = $this->findGameOrFail($gameId);

        if ($game->initial_shuffler_seat_number === null) {
            return null;
        }

        $seats = DB::table('game_player_seat')
            ->where('game_id', $gameId)
            ->orderBy('seat_number')
            ->pluck('seat_number')
            ->map(fn ($s) => (int) $s)
            ->values();

        $totalPlayers = $seats->count();

        if ($totalPlayers < 4) {
            return null;
        }

        $initialSeat  = (int) $game->initial_shuffler_seat_number;
        $initialIndex = $seats->search($initialSeat);

        if ($initialIndex === false) {
            return null;
        }

        $roundNumber = (int) $game->current_round_number;
        $nextIndex   = ($initialIndex + $roundNumber) % $totalPlayers;

        return $seats[$nextIndex];
    }

    /**
     * Permanently remove a game record and let the database cascade to all related rows.
     *
     * @param  int  $gameId  Identifier of the game to delete.
     * @return void
     * Logic: issue a single delete on the games table; all dependent tables (rounds, round_scores,
     *   game_team, game_user, game_player_seat, round_drafts) are set up with cascadeOnDelete foreign
     *   keys so the database handles cleanup automatically.
     */
    public function deleteGame(int $gameId): void
    {
        Game::query()->where('id', $gameId)->delete();
    }

    /**
     * Return the set of user IDs that are already linked to a given game (any role).
     *
     * @param  int         $gameId   Identifier of the game.
     * @param  array<int>  $userIds  Candidate user IDs to check.
     * @return array<int>  User IDs from the candidate list that already exist in the pivot.
     * Logic: query the game_user pivot for the given game, restrict to the supplied IDs, and
     *   return the intersection so the service can exclude already-enrolled users before
     *   performing a bulk insert — preventing composite-primary-key violations.
     */
    public function getExistingGameUserIds(int $gameId, array $userIds): array
    {
        return DB::table('game_user')
            ->where('game_id', $gameId)
            ->whereIn('user_id', $userIds)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * Upgrade a pending_invitee pivot row to the viewer role.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $userId  Identifier of the user accepting the invitation.
     * @return bool True when a pending_invitee row was found and updated, false otherwise.
     * Logic: update the game_user pivot row that matches the (game_id, user_id) pair and
     *   currently holds the pending_invitee role; returns false when no such row exists so
     *   the service layer can raise a validation error without an extra existence query.
     */
    public function upgradeInvitationToViewer(int $gameId, int $userId): bool
    {
        return (bool) DB::table('game_user')
            ->where('game_id', $gameId)
            ->where('user_id', $userId)
            ->where('role', GameUserRole::PendingInvitee->value)
            ->update(['role' => GameUserRole::Viewer->value, 'updated_at' => now()]);
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
                'games.current_round_number',
                'game_user.role as user_role',
            ])
            ->firstOrFail();
    }
}
