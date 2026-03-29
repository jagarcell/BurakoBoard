<?php

namespace App\Services;

use App\Enums\GameUserRole;
use App\Events\GameInvitationSent;
use App\Mail\GameInvitationMail;
use App\Models\Game;
use App\Models\User;
use App\Repositories\GameRepository;
use App\Repositories\InvitationRepository;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

class InvitationService
{
    /**
     * Construct the service with invitation repository dependencies.
     *
     * @param  \App\Repositories\GameRepository       $gameRepository       Needed to verify game existence before invitation operations.
     * @param  \App\Repositories\InvitationRepository $invitationRepository Handles pending-invitee queries and lifecycle.
     * @return void
     * Logic: inject only the repositories required for invitation concerns owned by this service.
     */
    public function __construct(
        private readonly GameRepository $gameRepository,
        private readonly InvitationRepository $invitationRepository,
    ) {
    }

    /**
     * Return the games for which the authenticated user has a pending invitation.
     *
     * @param  int  $userId  Identifier of the authenticated user.
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Pending-invitation games.
     * Logic: delegate to the repository to retrieve only the games where the user holds a
     *   pending_invitee pivot row, providing a focused payload for the bell popup refresh.
     */
    public function listPendingInvitations(int $userId): Collection
    {
        return $this->invitationRepository->getPendingInvitations($userId);
    }

    /**
     * Determine whether a user has at least one pending game invitation.
     *
     * @param  int  $userId  Identifier of the authenticated user.
     * @return bool True when the user has one or more pending_invitee rows in game_user.
     * Logic: delegate the existence check to the invitation repository so callers such as
     *   middleware can query this without bypassing the service layer.
     */
    public function userHasPendingInvitations(int $userId): bool
    {
        return $this->invitationRepository->hasPendingInvitations($userId);
    }

    /**
     * Return a paginated list of users eligible to receive a viewer invite for a game.
     *
     * @param  int  $gameId         Identifier of the game for which invites would be sent.
     * @param  int  $excludeUserId  Identifier of the current authenticated user to exclude from results.
     * @param  int  $page           1-based page number requested by the caller.
     * @param  int  $perPage        Number of users per page; defaults to 10.
     * @return \Illuminate\Contracts\Pagination\LengthAwarePaginator<\App\Models\User> Paginated invitable users.
     * Logic: delegate to the repository so the invite dialog has a filtered, paginated user source
     *   without the service layer containing any query logic.
     */
    public function listInvitableUsers(int $gameId, int $excludeUserId, int $page, int $perPage = 10): LengthAwarePaginator
    {
        return $this->invitationRepository->getInvitableUsersForGame($gameId, $excludeUserId, $page, $perPage);
    }

    /**
     * Persist pending invitations and dispatch invitation emails to the selected users.
     *
     * @param  int              $gameId   Identifier of the game the users are being invited to watch.
     * @param  array<int>       $userIds  IDs of the users who should receive invitations.
     * @param  \App\Models\User $inviter  The authenticated user (creator) sending the invitations.
     * @return int Number of new invitation rows created and emailed.
     * Logic:
     *   1. Verify the game exists; abort with 404 if missing.
     *   2. Filter out any user IDs already enrolled in the game (any role) to prevent
     *      composite-primary-key violations on the pivot table.
     *   3. Load the target User models so we have name + email for mail dispatch.
     *   4. Bulk-insert pending_invitee rows in one query.
     *   5. Dispatch one GameInvitationMail per invitee; each mail carries the game, invitee,
     *      and inviter context needed to render the Blade email template.
     *   6. Broadcast GameInvitationSent on each invitee's private channel so the frontend
     *      notification bell updates in real time without a page reload.
     *   7. Return the count of new invitations created so the controller can include it in the response.
     */
    public function sendInvitations(int $gameId, array $userIds, User $inviter): int
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        $existingIds = $this->invitationRepository->getExistingGameUserIds($gameId, $userIds);
        $newUserIds  = array_values(array_diff($userIds, $existingIds));

        if (empty($newUserIds)) {
            return 0;
        }

        $this->invitationRepository->bulkAttachPendingInviteesToGame($gameId, $newUserIds);

        $invitees = $this->invitationRepository->getUsersByIds($newUserIds);

        foreach ($invitees as $invitee) {
            try {
                Mail::to($invitee->email)->send(new GameInvitationMail($game, $invitee, $inviter));
            } catch (TransportExceptionInterface $e) {
                Log::warning('Invitation email failed', [
                    'game_id'   => $game->id,
                    'recipient' => $invitee->email,
                    'reason'    => $e->getMessage(),
                ]);
            }
            broadcast(new GameInvitationSent(
                inviteeId:   $invitee->id,
                gameId:      $game->id,
                gameName:    $game->name,
                inviterName: $inviter->name,
            ))->toOthers();
        }

        Log::info('Invitations sent', [
            'game_id'    => $game->id,
            'count'      => count($newUserIds),
            'recipients' => $invitees->pluck('email')->all(),
        ]);

        return count($newUserIds);
    }

    /**
     * Accept a pending game invitation, upgrading the user's role from pending_invitee to viewer.
     *
     * @param  int  $gameId  Identifier of the game whose invitation should be accepted.
     * @param  int  $userId  Identifier of the authenticated user accepting the invitation.
     * @return \App\Models\Game The game model with user_role set to 'viewer'.
     * Logic: verify the game exists (404 if not), attempt to upgrade the pivot row from
     *   pending_invitee to viewer, and throw a validation exception when no matching row
     *   is found (user was never invited or already accepted). Finally, return the
     *   game record with the updated role attached so the controller can serialize
     *   a GameListItemResource without an additional query.
     */
    public function acceptInvitation(int $gameId, int $userId): Game
    {
        $this->gameRepository->findGameOrFail($gameId);

        $upgraded = $this->invitationRepository->upgradeInvitationToViewer($gameId, $userId);

        if (! $upgraded) {
            throw ValidationException::withMessages([
                'invitation' => 'No pending invitation found for this game.',
            ]);
        }

        return $this->gameRepository->getGameWithUserRole($gameId, $userId);
    }

    /**
     * Accept a pending game invitation silently, without throwing on missing rows.
     *
     * @param  int  $gameId  Identifier of the game whose invitation should be accepted.
     * @param  int  $userId  Identifier of the authenticated user.
     * @return bool True when the pivot row was upgraded from pending_invitee to viewer; false when no pending invitation existed.
     * Logic: delegates directly to the repository upgrade query and returns its boolean result.
     *   Unlike acceptInvitation() this method never throws, making it safe to call during the
     *   post-login flow where the game ID comes from the session and the user may have already
     *   manually accepted or may not have been invited at all.
     */
    public function acceptInvitationIfPending(int $gameId, int $userId): bool
    {
        return $this->invitationRepository->upgradeInvitationToViewer($gameId, $userId);
    }

    /**
     * Invite all pending_invitee and viewer users from a source game to follow its rematch.
     *
     * @param  int               $sourceGameId  Identifier of the finished source game.
     * @param  int               $newGameId     Identifier of the newly created rematch game.
     * @param  \App\Models\User  $inviter       The user who created the rematch (already enrolled as creator of the new game).
     * @return int Number of new invitation rows created.
     * Logic:
     *   1. Fetch all user IDs from the source game that hold a pending_invitee or viewer role.
     *   2. Exclude the inviter themselves — they are already enrolled as the creator of the rematch.
     *   3. Delegate to sendInvitations() for the new game so the full invitation flow
     *      (pivot insert, mail dispatch, broadcast) runs consistently for each eligible user.
     */
    public function sendRematchInvitations(int $sourceGameId, int $newGameId, User $inviter): int
    {
        $eligibleIds = $this->invitationRepository->getUserIdsByRolesInGame($sourceGameId, [
            GameUserRole::PendingInvitee->value,
            GameUserRole::Viewer->value,
        ]);

        $userIds = array_values(array_filter(
            $eligibleIds,
            fn (int $id): bool => $id !== $inviter->id,
        ));

        if (empty($userIds)) {
            return 0;
        }

        return $this->sendInvitations($newGameId, $userIds, $inviter);
    }
}
