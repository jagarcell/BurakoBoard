<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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
     * Return the existing games available on the dashboard.
     *
     * @return \Illuminate\Http\JsonResponse Game list response.
     * Logic: delegate list retrieval to the service and serialize each game through a dedicated API resource for selector consumption.
     */
    public function index(): JsonResponse
    {
        $games = $this->service->listGames();

        return response()->json([
            'games' => GameListItemResource::collection($games),
        ]);
    }

    /**
     * Create a new Burako game.
     *
     * @param  \App\Http\Requests\Api\V1\StoreGameRequest  $request  Validated request for game creation.
     * @return \Illuminate\Http\JsonResponse Created game summary response.
     * Logic: forward validated input to the service and return the summary through the API response envelope.
     */
    public function store(StoreGameRequest $request): JsonResponse
    {
        $summary = $this->service->createGame($request->validated());

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
}
