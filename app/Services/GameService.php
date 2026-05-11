<?php

namespace App\Services;

use App\Enums\GameStatus;
use App\Enums\GameUserRole;
use App\Events\GameDeleted;
use App\Events\GameRoleUpdated;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Http\Resources\Api\V1\RematchChainItemResource;
use App\Models\Game;
use App\Models\User;
use App\Repositories\GameRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class GameService
{
    /**
     * Construct the service with game-lifecycle repository and service dependencies.
     *
     * @param  \App\Repositories\GameRepository  $gameRepository     Handles game CRUD and game_user pivot.
     * @param  \App\Repositories\TeamRepository  $teamRepository     Handles team lookups needed by createRematch and gameHasTwoTeams.
     * @param  \App\Repositories\SeatRepository  $seatRepository     Handles seat copy operations in createRematch.
     * @param  \App\Services\InvitationService   $invitationService  Handles invitation dispatch for rematch games.
     * @return void
     * Logic: inject only the repositories and services required for game lifecycle concerns owned by this service.
     */
    public function __construct(
        private readonly GameRepository $gameRepository,
        private readonly TeamRepository $teamRepository,
        private readonly SeatRepository $seatRepository,
        private readonly InvitationService $invitationService,
    ) {
    }

    /**
     * Return the games linked to a specific user for dashboard selection.
     *
     * @param  int  $userId  Identifier of the authenticated user requesting the list.
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Games the user has access to, ordered for selector display.
     * Logic: delegate the user-scoped game listing query to the repository so the dashboard
     *   can populate its selector with only the games the current user is enrolled in.
     */
    public function listGames(int $userId): Collection
    {
        return $this->gameRepository->getGameList($userId);
    }

    /**
     * Create a new game in progress and enrol the creator in the game_user pivot.
     *
     * @param  array<string, mixed>  $payload  Validated game data with name and target points.
     * @param  int  $userId  Identifier of the authenticated user creating the game.
     * @return array<string, mixed> Game summary payload.
     * Logic: persist the game record, attach the creating user with the 'creator' role so the
     *   game appears in their filtered dashboard list, then return the full summary payload.
     */
    public function createGame(array $payload, int $userId): array
    {
        $game = $this->gameRepository->createGame([
            'name'                         => $payload['name'],
            'target_points'                => (int) $payload['target_points'],
            'status'                       => GameStatus::InProgress,
            'winning_team_id'              => null,
            'current_round_number'         => 0,
            'initial_shuffler_seat_number' => null,
        ]);

        $this->gameRepository->attachUserToGame($game->id, $userId, GameUserRole::Creator->value);

        Log::info('Game created', ['game_id' => $game->id, 'creator_id' => $userId]);

        return (new GameSummaryResource($this->gameRepository->getGameSummary($game->id)))->resolve();
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
        return $this->gameRepository->updateGame($gameId, [
            'name'          => $payload['name'],
            'target_points' => (int) $payload['target_points'],
        ]);
    }

    /**
     * Return all available base scoring elements.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\BaseElement> All base elements ordered by id.
     * Logic: delegate the base element retrieval to the repository so the controller can obtain
     *   the scoring catalogue without direct query coupling.
     */
    public function listBaseElements(): Collection
    {
        return $this->gameRepository->getBaseElements();
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
        return (new GameSummaryResource($this->gameRepository->getGameSummary($gameId)))->resolve();
    }

    /**
     * Determine whether a game has two teams assigned.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return bool True when the game already has two teams, false otherwise.
     * Logic: verify the game exists (throws 404 if missing), then delegate the team count check to the repository.
     */
    public function gameHasTwoTeams(int $gameId): bool
    {
        $this->gameRepository->findGameOrFail($gameId);

        return $this->teamRepository->gameHasTwoTeams($gameId);
    }

    /**
     * Delete a game that has no recorded rounds, enforcing creator-only access.
     *
     * @param  int  $gameId  Identifier of the game to delete.
     * @param  int  $userId  Identifier of the authenticated user requesting the deletion.
     * @return void
     * Logic:
     *   1. Resolve the game or fail with 404.
     *   2. Verify the requesting user is the creator via the game_user pivot; abort 403 if not.
     *   3. Guard against deletion when rounds have already been recorded; throw a validation
     *      exception so the HTTP layer converts it to a 422 with a descriptive message.
     *   4. Broadcast a GameDeleted event on the game's private channel *before* the DB row
     *      is removed so channel-auth can still verify membership. Use toOthers() to exclude
     *      the deleting tab, which already resets its own dropdown synchronously.
     *   5. Delegate the permanent removal to the repository, relying on DB cascade for related rows.
     */
    public function deleteGame(int $gameId, int $userId): void
    {
        $this->gameRepository->findGameOrFail($gameId);

        if (! $this->gameRepository->isGameCreator($gameId, $userId)) {
            abort(403, 'Only the game creator can delete this game.');
        }

        if ($this->gameRepository->gameHasRounds($gameId)) {
            throw ValidationException::withMessages([
                'game' => ['This game cannot be deleted because it already has recorded rounds.'],
            ]);
        }

        // Broadcast before the DB row is removed so the channel-auth guard can
        // still verify membership. toOthers() excludes the deleting tab which
        // already resets its own dropdown synchronously via handleDeleteGame().
        broadcast(new GameDeleted($gameId))->toOthers();

        $this->gameRepository->deleteGame($gameId);

        Log::info('Game deleted', ['game_id' => $gameId, 'deleted_by' => $userId]);
    }

    /**
     * Create a new game as a rematch of an existing finished game.
     *
     * @param  int                   $sourceGameId  Identifier of the finished game being rematched.
     * @param  array<string, mixed>  $payload       Validated payload containing name and target_points.
     * @param  \App\Models\User      $user          The authenticated user creating the rematch.
     * @return array<string, mixed> Game summary payload for the newly created rematch game.
     * Logic:
     *  1. Load the source game and abort with a validation error if it is still in progress.
     *  2. Restrict rematch creation to the game's creator.
     *  3. Within a DB transaction: create the new game, attach the creator, attach the same teams
     *     from the source game (preserving team order), copy seat assignments from the source game,
     *     and set the initial shuffler seat to the player who would be cutter in the next rotation
     *     so the player order carries over correctly.
     *  4. After the transaction, send invitations to all pending_invitee and viewer users from the
     *     source game so they can follow the rematch without manual re-invitation.
     *  5. Return the full summary payload.
     */
    public function createRematch(int $sourceGameId, array $payload, User $user): array
    {
        $userId     = $user->id;
        $sourceGame = $this->gameRepository->findGameOrFail($sourceGameId);

        if ($sourceGame->status !== GameStatus::Finished) {
            throw ValidationException::withMessages([
                'game' => 'Only finished games can be rematched.',
            ]);
        }

        if (! $this->gameRepository->isGameCreator($sourceGameId, $userId)) {
            abort(403, 'Only the game creator can start a rematch.');
        }

        try {
            $newGameId = DB::transaction(function () use ($sourceGameId, $sourceGame, $payload, $userId): int {
                $newGame = $this->gameRepository->createGame([
                    'name'                         => $payload['name'],
                    'target_points'                => (int) $payload['target_points'],
                    'status'                       => GameStatus::InProgress,
                    'winning_team_id'              => null,
                    'rematch_from_game_id'         => $sourceGameId,
                    'current_round_number'         => 0,
                    'initial_shuffler_seat_number' => null,
                ]);

                $this->gameRepository->attachUserToGame($newGame->id, $userId, GameUserRole::Creator->value);

                $teamIds = $this->teamRepository->getOrderedTeamIdsForGame($sourceGameId);

                foreach ($teamIds as $teamId) {
                    $this->teamRepository->attachTeamToGame($newGame->id, (int) $teamId);
                }

                $this->seatRepository->copySeatsFromGame($sourceGameId, $newGame->id);

                $nextCutterSeat = $this->seatRepository->computeNextCutterSeatNumber($sourceGame);

                if ($nextCutterSeat !== null) {
                    $this->gameRepository->updateGameInitialShufflerSeat($newGame, $nextCutterSeat);
                }

                return $newGame->id;
            });
        } catch (QueryException $e) {
            Log::error('DB transaction failed in createRematch', [
                'source_game_id' => $sourceGameId,
                'sql'            => $e->getSql(),
                'bindings'       => $e->getBindings(),
                'message'        => $e->getMessage(),
                'user_id'        => $userId,
            ]);
            throw ValidationException::withMessages([
                'game' => ['The rematch could not be created due to a database error. Please try again.'],
            ]);
        }

        $this->invitationService->sendRematchInvitations($sourceGameId, $newGameId, $user);

        return (new GameSummaryResource($this->gameRepository->getGameSummary($newGameId)))->resolve();
    }

    /**
     * Return a page of earlier rounds for a game, strictly before a given round number.
     *
     * @param  int  $gameId       Identifier of the game.
     * @param  int  $beforeRound  Return only rounds with round_number < this value.
     * @param  int  $limit        Maximum number of rounds to return (default 25).
     * @return array{items: list<mixed>, has_more: bool} Paginated round history page.
     * Logic: validate the game exists, then delegate paged round retrieval to the repository
     *   so the controller can serve older rounds without loading the full game summary.
     */
    public function getRoundsPage(int $gameId, int $beforeRound, int $limit = 25): array
    {
        $this->gameRepository->findGameOrFail($gameId);

        return $this->gameRepository->getRoundsPage($gameId, $beforeRound, $limit);
    }

    /**
     * Return all games in the rematch chain that contains the given game.
     *
     * @param  int  $gameId  Identifier of any game in the chain.
     * @return array<string, mixed> Ordered list of chain items from the root game to the latest rematch.
     * Logic: delegate collection of the full chain to the repository, then wrap each game row
     *   in a RematchChainItemResource so the response shape is consistent and predictable.
     */
    public function getRematchChain(int $gameId): array
    {
        $this->gameRepository->findGameOrFail($gameId);

        $games = $this->gameRepository->getRematchChain($gameId);

        return RematchChainItemResource::collection($games)->resolve();
    }

    /**
     * Return all users who are currently following a game as viewers.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Support\Collection<int, \stdClass> Users with viewer role (id, name, email).
     * Logic: verify the game exists, then delegate the viewer lookup to the repository so the
     *   delegation modal can display only the registered viewers eligible to receive the host role.
     */
    public function listGameViewers(int $gameId): Collection
    {
        $this->gameRepository->findGameOrFail($gameId);

        return $this->gameRepository->getGameViewers($gameId);
    }

    /**
     * Transfer the host (creator) role from the requesting user to a viewer.
     *
     * @param  int  $gameId            Identifier of the game.
     * @param  int  $requestingUserId  Identifier of the authenticated user requesting the transfer (must be creator).
     * @param  int  $targetUserId      Identifier of the viewer who will receive the creator role.
     * @return \App\Models\Game The game record with the requesting user's updated role attached as user_role.
     * Logic:
     *   1. Verify the requesting user is the game creator; abort 403 otherwise.
     *   2. Verify the target user exists in the game with the viewer role; throw a validation
     *      exception if not, so a meaningful 422 is returned rather than a silent no-op.
     *   3. Within a DB transaction, atomically promote the target user to creator and demote
     *      the requesting user to viewer so the pivot is never in a partially-updated state.
     *   4. Invalidate the game summary cache so any subsequent read reflects the new state.
     *   5. Return the game with the requesting user's new role (viewer) attached so the API
     *      response can update the caller's session immediately.
     */
    public function delegateHost(int $gameId, int $requestingUserId, int $targetUserId): Game
    {
        $this->gameRepository->findGameOrFail($gameId);

        if (! $this->gameRepository->isGameCreator($gameId, $requestingUserId)) {
            abort(403, 'Only the game creator can delegate the host role.');
        }

        $viewers = $this->gameRepository->getGameViewers($gameId);
        $isViewer = $viewers->contains('id', $targetUserId);

        if (! $isViewer) {
            throw ValidationException::withMessages([
                'user_id' => ['The selected user is not a viewer of this game.'],
            ]);
        }

        try {
            DB::transaction(function () use ($gameId, $requestingUserId, $targetUserId): void {
                $this->gameRepository->updateUserRole($gameId, $targetUserId, GameUserRole::Creator->value);
                $this->gameRepository->updateUserRole($gameId, $requestingUserId, GameUserRole::Viewer->value);
            });
        } catch (\Throwable $e) {
            Log::error('Failed to delegate host role', [
                'game_id'           => $gameId,
                'requesting_user'   => $requestingUserId,
                'target_user'       => $targetUserId,
                'error'             => $e->getMessage(),
            ]);
            throw $e;
        }

        $this->gameRepository->forgetGameSummaryCache($gameId);

        // Notify the new host on their private user channel so their UI can
        // update the user_role for this game entry in real time without any
        // additional HTTP request or page reload.
        broadcast(new GameRoleUpdated($targetUserId, $gameId, GameUserRole::Creator->value));

        Log::info('Host role delegated', [
            'game_id'    => $gameId,
            'new_creator' => $targetUserId,
            'new_viewer'  => $requestingUserId,
        ]);

        return $this->gameRepository->getGameWithUserRole($gameId, $requestingUserId);
    }
}
