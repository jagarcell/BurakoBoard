<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreTeamRequest;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Services\BurakoGameService;
use Illuminate\Http\JsonResponse;

class TeamController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\BurakoGameService  $service  Service that orchestrates team operations.
     * @return void Stores the service dependency used by this controller.
     * Logic: keep write orchestration in the service so controller only handles HTTP transport concerns.
     */
    public function __construct(private readonly BurakoGameService $service)
    {
    }

    /**
     * Create a new team for a specific game.
     *
     * @param  \App\Http\Requests\Api\V1\StoreTeamRequest  $request  Validated team request.
     * @param  int  $gameId  Identifier of the target game.
     * @return \Illuminate\Http\JsonResponse Updated game summary response.
     * Logic: pass sanitized payload to the service and return the post-write game summary.
     */
    public function store(StoreTeamRequest $request, int $gameId): JsonResponse
    {
        $summary = $this->service->addTeam($gameId, $request->validated());

        return response()->json([
            'game' => new GameSummaryResource($summary),
        ], 201);
    }
}
