<?php

namespace App\Repositories;

use App\Models\Player;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class PlayerRepository
{
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
     * Check whether a team already has a player whose display name matches the given name.
     *
     * @param  int     $teamId  Identifier of the team.
     * @param  string  $name    Player name to look up, already normalised.
     * @return bool True when a case-insensitive match exists in the team.
     * Logic: join team_player with players and compare LOWER(display_name) so that 'Carlos' and
     * 'CARLOS' are treated as duplicates.
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
     * Return all registered users ordered by name for player selection.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\User> Users ordered alphabetically by name.
     * Logic: fetch a minimal id-and-name user list so team creation dialogs can present registered
     * player candidates without loading full profile data.
     */
    public function getUserList(): Collection
    {
        return User::query()
            ->select(['id', 'name'])
            ->orderBy('name')
            ->get();
    }
}
