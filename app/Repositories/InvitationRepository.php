<?php

namespace App\Repositories;

use App\Enums\GameUserRole;
use App\Models\Game;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use App\Models\Invitation;
use Illuminate\Support\Str;

class InvitationRepository
{
    /**
     * Return only the games for which the given user holds a pending_invitee role.
     *
     * @param  int  $userId  Identifier of the authenticated user.
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Games where the user has a pending invitation, newest first.
     * Logic: join the game_user pivot and filter to rows where user_id matches and role is
     *   pending_invitee, selecting only the columns needed to render an invitation card.
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
     * Return a paginated list of users eligible to receive a viewer invite for a game.
     *
     * @param  int  $gameId         Identifier of the game for which invites would be sent.
     * @param  int  $excludeUserId  Identifier of the authenticated user who must not appear in the list.
     * @param  int  $page           1-based page number requested by the caller.
     * @param  int  $perPage        Number of records per page.
     * @return \Illuminate\Contracts\Pagination\LengthAwarePaginator<\App\Models\User> Paginated users ordered alphabetically by name.
     * Logic: exclude the authenticated user and any user that already holds a pending_invitee
     *   entry on the game_user pivot for this specific game, then paginate the remaining
     *   users alphabetically.
     */
    public function getInvitableUsersForGame(int $gameId, int $excludeUserId, int $page, int $perPage): LengthAwarePaginator
    {
        return User::query()
            ->select(['users.id', 'users.name'])
            ->where('users.id', '!=', $excludeUserId)
            ->where('users.is_guest', false)
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
     * Logic: fetch only the columns needed for mail dispatch using a single WHERE IN round-trip.
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
     *   supplied user ID. Users already present in the game_user pivot for this game must be excluded
     *   before calling this method (handled at the service layer) to avoid composite-primary-key violations.
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
     * Return the set of user IDs that are already linked to a given game (any role).
     *
     * @param  int         $gameId   Identifier of the game.
     * @param  array<int>  $userIds  Candidate user IDs to check.
     * @return array<int>  User IDs from the candidate list that already exist in the pivot.
     * Logic: query the game_user pivot for the given game, restrict to the supplied IDs, and
     *   return the intersection so the service can exclude already-enrolled users before
     *   performing a bulk insert.
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
     * Return the user IDs that hold any of the given roles in a game.
     *
     * @param  int            $gameId  Identifier of the game.
     * @param  array<string>  $roles   Role values to filter by (e.g. ['pending_invitee', 'viewer']).
     * @return array<int>     User IDs enrolled in the game with any of the specified roles.
     * Logic: query the game_user pivot filtering by game_id and any of the supplied role values,
     *   then return the matching user IDs cast to integers for safe downstream comparison.
     */
    public function getUserIdsByRolesInGame(int $gameId, array $roles): array
    {
        return DB::table('game_user')
            ->where('game_id', $gameId)
            ->whereIn('role', $roles)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * Ensure a user is enrolled on a game with the viewer role.
     *
     * @param  int  $gameId
     * @param  int  $userId
     * @return void
     * Logic: if a pivot row exists, update its role to viewer; otherwise insert a new
     * viewer pivot row. This is used when an email-based invitation is accepted and
     * no pending_invitee pivot was created previously.
     */
    public function attachViewerToGameIfMissing(int $gameId, int $userId): void
    {
        $exists = DB::table('game_user')
            ->where('game_id', $gameId)
            ->where('user_id', $userId)
            ->exists();

        $now = now();

        if ($exists) {
            DB::table('game_user')
                ->where('game_id', $gameId)
                ->where('user_id', $userId)
                ->update(['role' => GameUserRole::Viewer->value, 'updated_at' => $now]);
        } else {
            DB::table('game_user')->insert([
                'game_id'    => $gameId,
                'user_id'    => $userId,
                'role'       => GameUserRole::Viewer->value,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /**
     * Create a server-side invitation record for an external email.
     *
     * @param  string  $email  Recipient email address.
     * @param  int|null  $gameId  Optional game id the invitation targets.
     * @param  int|null  $inviterId  User id who sent the invite.
     * @param  \DateTimeInterface|null  $expiresAt  Optional expiry timestamp.
     * @return \App\Models\Invitation Created invitation model.
     * Logic: generate a secure random token, persist the invitation row, and return the model.
     */
    public function createInvitationForEmail(string $email, ?int $gameId = null, ?int $inviterId = null, $expiresAt = null): Invitation
    {
        $token = Str::random(48);

        return Invitation::create([
            'email' => $email,
            'game_id' => $gameId,
            'inviter_id' => $inviterId,
            'token' => $token,
            'expires_at' => $expiresAt,
        ]);
    }

    /**
     * Find an invitation by its token.
     *
     * @param  string  $token
     * @return \App\Models\Invitation|null
     * Logic: return the invitation model or null if not found.
     */
    public function findByToken(string $token): ?Invitation
    {
        return Invitation::where('token', $token)->first();
    }

    /**
     * Mark an invitation as used.
     *
     * @param  \App\Models\Invitation  $invitation
     * @return void
     * Logic: set the used_at timestamp and persist the change.
     */
    public function markInvitationUsed(Invitation $invitation): void
    {
        $invitation->used_at = now();
        $invitation->save();
    }
}
