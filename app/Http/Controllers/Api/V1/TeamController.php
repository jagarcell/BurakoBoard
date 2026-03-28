<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreTeamRequest;
use App\Http\Resources\Api\V1\TeamListItemResource;
use App\Services\TeamService;
use Illuminate\Http\JsonResponse;

class TeamController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\TeamService  $service  Service that orchestrates team operations.
     * @return void
     * Logic: keep write orchestration in the service so controller only handles HTTP transport concerns.
     */
    public function __construct(private readonly TeamService $service)
    {
    }

    /**
     * Return a list of all teams with their players for the team selector.
     *
     * @return \Illuminate\Http\JsonResponse Team list response.
     * Logic: delegate retrieval to the service and serialize each team through the list-item resource for the team picker.
     */
    public function index(): JsonResponse
    {
        $teams = $this->service->listTeams();

        return response()->json([
            'teams' => TeamListItemResource::collection($teams),
        ]);
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
            'game' => $summary,
        ], 201);
    }

    /**
     * Update the name of a team belonging to a specific game.
     *
     * @param  \App\Http\Requests\Api\V1\StoreTeamRequest  $request  Validated team request.
     * @param  int  $gameId  Identifier of the target game.
     * @param  int  $teamId  Identifier of the team to update.
     * @return \Illuminate\Http\JsonResponse Updated game summary response.
     * Logic: pass sanitized payload to the service and return the post-update game summary.
     */
    public function update(StoreTeamRequest $request, int $gameId, int $teamId): JsonResponse
    {
        $summary = $this->service->updateTeam($gameId, $teamId, $request->validated());

        return response()->json([
            'game' => $summary,
        ]);
    }

    /**
     * Attach an existing global team to a game without creating a new team entity.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the existing team to attach.
     * @return \Illuminate\Http\JsonResponse Updated game summary response.
     * Logic: delegate the attach operation to the service (which validates game status and prevents
     * duplicate pivot rows), then return the refreshed game summary with the team included.
     */
    public function attach(int $gameId, int $teamId): JsonResponse
    {
        $summary = $this->service->attachExistingTeam($gameId, $teamId);

        return response()->json([
            'game' => $summary,
        ], 201);
    }
}
