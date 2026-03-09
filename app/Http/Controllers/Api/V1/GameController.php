<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreGameRequest;
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
}
