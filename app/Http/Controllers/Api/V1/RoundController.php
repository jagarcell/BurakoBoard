<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RecordRoundRequest;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Services\BurakoGameService;
use Illuminate\Http\JsonResponse;

class RoundController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\BurakoGameService  $service  Service that orchestrates round scoring.
     * @return void Stores the service dependency used by this controller.
     * Logic: keep round-scoring rules in service layer and leave controller responsible for request/response handling.
     */
    public function __construct(private readonly BurakoGameService $service)
    {
    }

    /**
     * Record one round score for all teams in a game.
     *
     * @param  \App\Http\Requests\Api\V1\RecordRoundRequest  $request  Validated round scoring request.
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Http\JsonResponse Updated game summary response.
     * Logic: pass validated round payload to service and return recalculated scoreboard/history projection.
     */
    public function store(RecordRoundRequest $request, int $gameId): JsonResponse
    {
        $summary = $this->service->recordRound($gameId, $request->validated());

        return response()->json([
            'game' => new GameSummaryResource($summary),
        ]);
    }
}
