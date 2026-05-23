<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\AmendRoundRequest;
use App\Http\Requests\Api\V1\RecordRoundRequest;
use App\Services\RoundService;
use Illuminate\Http\JsonResponse;

class RoundController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\RoundService  $service  Service that orchestrates round scoring.
     * @return void
     * Logic: keep round-scoring rules in service layer and leave controller responsible for request/response handling.
     */
    public function __construct(private readonly RoundService $service)
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
            'game' => $summary,
        ]);
    }

    /**
     * Amend a previously recorded round.
     *
     * @param  \App\Http\Requests\Api\V1\AmendRoundRequest  $request  Validated amendment payload.
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $roundNumber  Round number to amend.
     * @return \Illuminate\Http\JsonResponse Updated game summary response.
     * Logic: delegate the amendment operation to the service and return the refreshed
     * scoreboard/history projection after persistence.
     */
    public function amend(AmendRoundRequest $request, int $gameId, int $roundNumber): JsonResponse
    {
        $summary = $this->service->amendRound($gameId, $roundNumber, $request->validated());

        return response()->json([
            'game' => $summary,
        ]);
    }
}
