<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\SetInitialShufflerRequest;
use App\Http\Requests\Api\V1\StoreGameInviteRequest;
use App\Http\Requests\Api\V1\StoreGameRequest;
use App\Http\Requests\Api\V1\UpdateGameRequest;
use App\Http\Resources\Api\V1\GameListItemResource;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Services\BurakoGameService;
use Illuminate\Http\JsonResponse;

class GameController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\BurakoGameService  $service  Service that orchestrates game operations.
     * @return void Stores the service dependency used by HTTP action methods.
     * Logic: keep controller thin by delegating all business logic to the Burako service layer.
     */
    public function __construct(private readonly BurakoGameService $service)
    {
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
        $games = $this->service->listGames((int) auth()->id());

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
        $summary = $this->service->createGame($request->validated(), (int) auth()->id());

        return response()->json([
            'game' => new GameSummaryResource($summary),
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
        $summary = $this->service->getGameSummary($gameId);

        return response()->json([
            'game' => new GameSummaryResource($summary),
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
        $game = $this->service->updateGame($gameId, $request->validated());

        return response()->json([
            'game' => new GameListItemResource($game),
        ]);
    }

    /**
     * Report whether a game already has two teams assigned.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Http\JsonResponse Response containing a boolean has_two_teams flag.
     * Logic: delegate the team count check to the service and return a lightweight flag the frontend uses to determine when the round scoring inputs should become visible.
     */
    public function hasTwoTeams(int $gameId): JsonResponse
    {
        $hasTwoTeams = $this->service->gameHasTwoTeams($gameId);

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
     * Logic: delegate cutter selection rules to the service and return the refreshed summary payload.
     */
    public function setInitialShuffler(SetInitialShufflerRequest $request, int $gameId): JsonResponse
    {
        $summary = $this->service->setInitialShuffler($gameId, (int) $request->validated('player_id'));

        return response()->json([
            'game' => new GameSummaryResource($summary),
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
        $this->service->deleteGame($gameId, (int) auth()->id());

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
     *   service, and return the number of newly-created pending_invitee rows so the client can
     *   confirm success without a full re-fetch.
     */
    public function storeInvitations(StoreGameInviteRequest $request, int $gameId): JsonResponse
    {
        $count = $this->service->sendInvitations(
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
     * Accept a pending game invitation for the authenticated user.
     *
     * @param  int  $gameId  Identifier of the game whose invitation is being accepted.
     * @return \Illuminate\Http\JsonResponse Updated game list-item response with viewer role.
     * Logic: delegate role promotion from pending_invitee to viewer to the service layer;
     *   return a GameListItemResource carrying user_role='viewer' so the frontend can
     *   update the game entry in-place without re-fetching the full games list.
     */
    public function acceptInvitation(int $gameId): JsonResponse
    {
        $game = $this->service->acceptInvitation($gameId, (int) auth()->id());

        return response()->json([
            'game' => new GameListItemResource($game),
        ]);
    }
}
