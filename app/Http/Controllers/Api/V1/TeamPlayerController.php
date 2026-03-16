<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\AddTeamPlayerRequest;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Services\BurakoGameService;
use Illuminate\Http\JsonResponse;

class TeamPlayerController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\BurakoGameService  $service  Service that orchestrates player assignment.
     * @return void Stores the service dependency used by this controller.
     * Logic: route player-assignment business rules to service layer to keep controller minimal.
     */
    public function __construct(private readonly BurakoGameService $service)
    {
    }

    /**
     * Add a player to a game team.
     *
     * @param  \App\Http\Requests\Api\V1\AddTeamPlayerRequest  $request  Validated player assignment request.
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @return \Illuminate\Http\JsonResponse Updated game summary response.
     * Logic: validate request shape, delegate attach behavior to service, and return updated game projection.
     */
    public function store(AddTeamPlayerRequest $request, int $gameId, int $teamId): JsonResponse
    {
        $summary = $this->service->addPlayerToTeam($gameId, $teamId, $request->validated());

        return response()->json([
            'game' => new GameSummaryResource($summary),
        ], 201);
    }

    /**
     * Remove a player from a game team.
     *
     * @param  int  $gameId   Identifier of the game.
     * @param  int  $teamId   Identifier of the team.
     * @param  int  $playerId Identifier of the player to remove.
     * @return \Illuminate\Http\JsonResponse Updated game summary after the player is detached.
     * Logic: delegate removal to the service and return the refreshed game summary so the client can react to the updated roster.
     */
    public function destroy(int $gameId, int $teamId, int $playerId): JsonResponse
    {
        $summary = $this->service->removePlayerFromTeam($gameId, $teamId, $playerId);

        return response()->json([
            'game' => new GameSummaryResource($summary),
        ], 200);
    }
}
