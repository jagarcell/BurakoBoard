<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\AddTeamPlayerRequest;
use App\Http\Requests\Api\V1\SwapPlayerSeatsRequest;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Services\PlayerService;
use Illuminate\Http\JsonResponse;

class TeamPlayerController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\PlayerService  $service  Service that orchestrates player assignment.
     * @return void
     * Logic: route player-assignment business rules to service layer to keep controller minimal.
     */
    public function __construct(private readonly PlayerService $service)
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

    /**
     * Swap the seat numbers of two players within a game.
     *
     * @param  \App\Http\Requests\Api\V1\SwapPlayerSeatsRequest  $request  Validated request with player_id_a and player_id_b.
     * @param  int  $gameId  Identifier of the game in which the swap takes place.
     * @return \Illuminate\Http\JsonResponse Updated game summary after both seat rows are exchanged.
     * Logic: delegate the atomic swap to the service layer and return the refreshed game summary
     * so the client can reconcile the new seat order without a separate fetch.
     */
    public function swapSeats(SwapPlayerSeatsRequest $request, int $gameId): JsonResponse
    {
        $data = $request->validated();

        $summary = $this->service->swapPlayerSeats(
            $gameId,
            (int) $data['player_id_a'],
            (int) $data['player_id_b'],
        );

        return response()->json([
            'game' => new GameSummaryResource($summary),
        ]);
    }
}
