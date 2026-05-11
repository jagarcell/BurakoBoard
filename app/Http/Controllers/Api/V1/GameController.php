<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\DelegateHostRequest;
use App\Http\Requests\Api\V1\SetInitialShufflerRequest;
use App\Http\Requests\Api\V1\StoreGameInviteRequest;
use App\Http\Requests\Api\V1\StoreGameRematchRequest;
use App\Http\Requests\Api\V1\StoreGameRequest;
use App\Http\Requests\Api\V1\UpdateGameRequest;
use App\Http\Resources\Api\V1\GameListItemResource;
use App\Services\GameService;
use App\Services\InvitationService;
use App\Services\RoundService;
use Illuminate\Http\JsonResponse;

class GameController extends Controller
{
    /**
     * Construct the controller with focused domain service dependencies.
     *
     * @param  \App\Services\GameService        $gameService        Service that orchestrates game lifecycle operations.
     * @param  \App\Services\RoundService       $roundService       Service that orchestrates round-related operations.
     * @param  \App\Services\InvitationService  $invitationService  Service that orchestrates invitation operations.
     * @return void
     * Logic: inject focused services so each controller action delegates to the service that owns
     *   the corresponding domain concern, keeping the controller thin.
     */
    public function __construct(
        private readonly GameService $gameService,
        private readonly RoundService $roundService,
        private readonly InvitationService $invitationService,
    ) {
    }

    /**
     * Return the authenticated user's games for the dashboard selector.
     *
     * @return \Illuminate\Http\JsonResponse Game list response scoped to the current user.
     * Logic: pass the authenticated user's id to the service so only games where the user
     *   has a game_user pivot entry are returned, each carrying the user's role.
     */
    public function index(): JsonResponse
    {
        $games = $this->gameService->listGames((int) auth()->id());

        return response()->json([
            'games' => GameListItemResource::collection($games),
        ]);
    }

    /**
     * Create a new Burako game and enrol the authenticated user as creator.
     *
     * @param  \App\Http\Requests\Api\V1\StoreGameRequest  $request  Validated request for game creation.
     * @return \Illuminate\Http\JsonResponse Created game summary response.
     * Logic: forward validated input and the authenticated user's id to the service so the
     *   creator is added to the game_user pivot immediately after creation.
     */
    public function store(StoreGameRequest $request): JsonResponse
    {
        $summary = $this->gameService->createGame($request->validated(), (int) auth()->id());

        return response()->json([
            'game' => $summary,
        ], 201);
    }

    /**
     * Return a game summary with scoreboard and history.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Http\JsonResponse Game summary response.
     * Logic: request the read model from the service and serialize it with the game summary resource.
     */
    public function show(int $gameId): JsonResponse
    {
        $summary = $this->gameService->getGameSummary($gameId);

        return response()->json([
            'game' => $summary,
        ]);
    }

    /**
     * Update an existing game's name and target points.
     *
     * @param  \App\Http\Requests\Api\V1\UpdateGameRequest  $request  Validated request for game update.
     * @param  int  $gameId  Identifier of the game to update.
     * @return \Illuminate\Http\JsonResponse Updated game list-item response.
     * Logic: forward validated input to the service and return the refreshed game serialized as a list-item resource.
     */
    public function update(UpdateGameRequest $request, int $gameId): JsonResponse
    {
        $game = $this->gameService->updateGame($gameId, $request->validated());

        return response()->json([
            'game' => new GameListItemResource($game),
        ]);
    }

    /**
     * Report whether a game already has two teams assigned.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Http\JsonResponse Response containing a boolean has_two_teams flag.
     * Logic: delegate the team count check to the service and return a lightweight flag the
     *   frontend uses to determine when the round scoring inputs should become visible.
     */
    public function hasTwoTeams(int $gameId): JsonResponse
    {
        $hasTwoTeams = $this->gameService->gameHasTwoTeams($gameId);

        return response()->json([
            'has_two_teams' => $hasTwoTeams,
        ]);
    }

    /**
     * Set the initial cutter player before round 1 starts.
     *
     * @param  \App\Http\Requests\Api\V1\SetInitialShufflerRequest  $request  Validated request with selected player id.
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Http\JsonResponse Updated game summary response.
     * Logic: delegate cutter selection rules to the round service and return the refreshed summary payload.
     */
    public function setInitialShuffler(SetInitialShufflerRequest $request, int $gameId): JsonResponse
    {
        $summary = $this->roundService->setInitialShuffler($gameId, (int) $request->validated('player_id'));

        return response()->json([
            'game' => $summary,
        ]);
    }

    /**
     * Permanently delete a game that has no recorded rounds.
     *
     * @param  int  $gameId  Identifier of the game to delete.
     * @return \Illuminate\Http\JsonResponse 200 response confirming the deletion.
     * Logic: delegate ownership and round-count validation to the service, which aborts with
     *   403 if the caller is not the creator and throws a validation exception if rounds exist;
     *   on success return a 200 envelope with the deleted game id for client-side list removal.
     */
    public function destroy(int $gameId): JsonResponse
    {
        $this->gameService->deleteGame($gameId, (int) auth()->id());

        return response()->json([
            'message' => 'Game deleted successfully.',
            'game_id' => $gameId,
        ]);
    }

    /**
     * Send viewer invitations to one or more users for a specific game.
     *
     * @param  \App\Http\Requests\Api\V1\StoreGameInviteRequest  $request  Validated request containing an array of user IDs.
     * @param  int  $gameId  Identifier of the game for which invitations are being sent.
     * @return \Illuminate\Http\JsonResponse 201 response with the count of new invitations created.
     * Logic: extract the validated user_ids array, delegate persistence and mail dispatch to the
     *   invitation service, and return the number of newly-created pending_invitee rows so the
     *   client can confirm success without a full re-fetch.
     */
    public function storeInvitations(StoreGameInviteRequest $request, int $gameId): JsonResponse
    {
        $count = $this->invitationService->sendInvitations(
            $gameId,
            $request->validated('user_ids'),
            $request->user(),
        );

        return response()->json([
            'invited_count' => $count,
            'message'       => "Invitations sent to {$count} user(s).",
        ], 201);
    }

    /**
     * Return the authenticated user's pending game invitations.
     *
     * @return \Illuminate\Http\JsonResponse Pending invitation games serialised as list-item resources.
     * Logic: pass the authenticated user's id to the invitation service, which retrieves only
     *   games where the user holds a pending_invitee pivot role.
     */
    public function pendingInvitations(): JsonResponse
    {
        $invitations = $this->invitationService->listPendingInvitations((int) auth()->id());

        return response()->json([
            'invitations' => GameListItemResource::collection($invitations),
        ]);
    }

    /**
     * Create a new game as a rematch of an existing finished game.
     *
     * @param  \App\Http\Requests\Api\V1\StoreGameRematchRequest  $request  Validated request with name and target_points.
     * @param  int  $gameId  Identifier of the finished game to rematch.
     * @return \Illuminate\Http\JsonResponse 201 response containing the new game's summary.
     * Logic: delegate all business rules and persistence to the service layer; return the
     *   full game summary as a 201 so the frontend can select and display the new game immediately.
     */
    public function rematch(StoreGameRematchRequest $request, int $gameId): JsonResponse
    {
        $summary = $this->gameService->createRematch($gameId, $request->validated(), $request->user());

        return response()->json([
            'game' => $summary,
        ], 201);
    }

    /**
     * Accept a pending game invitation for the authenticated user.
     *
     * @param  int  $gameId  Identifier of the game whose invitation is being accepted.
     * @return \Illuminate\Http\JsonResponse Updated game list-item response with viewer role.
     * Logic: delegate role promotion from pending_invitee to viewer to the invitation service;
     *   return a GameListItemResource carrying user_role='viewer' so the frontend can
     *   update the game entry in-place without re-fetching the full games list.
     */
    public function acceptInvitation(int $gameId): JsonResponse
    {
        $game = $this->invitationService->acceptInvitation($gameId, (int) auth()->id());

        return response()->json([
            'game' => new GameListItemResource($game),
        ]);
    }

    /**
     * Return a paginated page of earlier rounds for a game.
     *
     * @param  \Illuminate\Http\Request  $request  The current request (reads before_round and limit query params).
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Http\JsonResponse Paginated round list response.
     * Logic: read before_round (default: PHP_INT_MAX so the first page returns the most recent rounds)
     *   and limit (default 25, max 100) from the query string, delegate to the service, and return
     *   the items and has_more flag under a descriptive key.
     */
    public function rounds(\Illuminate\Http\Request $request, int $gameId): JsonResponse
    {
        $beforeRound = max(1, (int) $request->query('before_round', PHP_INT_MAX));
        $limit       = min(100, max(1, (int) $request->query('limit', 25)));

        $page = $this->gameService->getRoundsPage($gameId, $beforeRound, $limit);

        return response()->json([
            'rounds' => $page,
        ]);
    }

    /**
     * Return all games in the rematch chain that contains the given game.
     *
     * @param  int  $gameId  Identifier of any game in the chain.
     * @return \Illuminate\Http\JsonResponse Ordered list of chain items from the root game to the latest rematch.
     * Logic: resolve the full chain from the service layer and return it under a descriptive
     *   named key so the frontend can render the rematch history list without additional requests.
     */
    public function rematchChain(int $gameId): JsonResponse
    {
        $chain = $this->gameService->getRematchChain($gameId);

        return response()->json([
            'games' => $chain,
        ]);
    }

    /**
     * Return the list of registered users following the game as viewers.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Http\JsonResponse Viewer list (id, name, email).
     * Logic: delegate viewer retrieval to the service, then return the collection directly
     *   since each row only carries lightweight public user data.
     */
    public function listViewers(int $gameId): JsonResponse
    {
        $viewers = $this->gameService->listGameViewers($gameId);

        return response()->json(['viewers' => $viewers->values()]);
    }

    /**
     * Transfer the host (creator) role to a viewer of the game.
     *
     * @param  \App\Http\Requests\Api\V1\DelegateHostRequest  $request  Validated request containing the target user_id.
     * @param  int  $gameId  Identifier of the game for which the role is being delegated.
     * @return \Illuminate\Http\JsonResponse The game with the requesting user's updated role (viewer).
     * Logic: delegate the role-swap business logic to the service (creator guard + viewer check +
     *   transactional role update), then return the game record with the caller's new viewer role
     *   so the frontend can immediately reflect the demotion without a separate re-fetch.
     */
    public function delegateHost(DelegateHostRequest $request, int $gameId): JsonResponse
    {
        $game = $this->gameService->delegateHost(
            $gameId,
            (int) auth()->id(),
            (int) $request->validated('user_id'),
        );

        return response()->json(['game' => new GameListItemResource($game)]);
    }
}
