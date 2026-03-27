<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\UserListItemResource;
use App\Services\InvitationService;
use App\Services\PlayerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    /**
     * Construct the controller with focused domain service dependencies.
     *
     * @param  \App\Services\PlayerService     $playerService     Service that provides user/player data.
     * @param  \App\Services\InvitationService $invitationService Service that provides invitable user pagination.
     * @return void
     * Logic: inject focused services so each action delegates to the service that owns the
     *   corresponding domain concern.
     */
    public function __construct(
        private readonly PlayerService $playerService,
        private readonly InvitationService $invitationService,
    ) {
    }

    /**
     * Return a list of registered users available for player assignment.
     *
     * @return \Illuminate\Http\JsonResponse User list response.
     * Logic: delegate retrieval to the player service and serialize each user through the
     *   dedicated list-item resource for player picker consumption.
     */
    public function index(): JsonResponse
    {
        $users = $this->playerService->listUsers();

        return response()->json([
            'users' => UserListItemResource::collection($users),
        ]);
    }

    /**
     * Return a paginated list of users eligible to receive a viewer invite for a given game.
     *
     * @param  \Illuminate\Http\Request  $request  Current authenticated request; provides the user id and query parameters.
     * @param  int  $gameId  Identifier of the game for which the invite list is being requested.
     * @return \Illuminate\Http\JsonResponse Paginated user list response excluding the authenticated user and existing pending invitees.
     * Logic: read the optional page query parameter, delegate to the invitation service with the current user id as the
     *   exclusion filter, then manually assemble the data/meta/links envelope around the transformed items
     *   so the invite modal receives a consistent, predictable pagination shape regardless of how the
     *   resource collection would behave when embedded inside response()->json().
     */
    public function indexInvitable(Request $request, int $gameId): JsonResponse
    {
        $page      = max(1, (int) $request->query('page', 1));
        $paginator = $this->invitationService->listInvitableUsers($gameId, (int) $request->user()->id, $page);

        return response()->json([
            'users' => [
                'data'  => UserListItemResource::collection($paginator->items()),
                'meta'  => [
                    'current_page' => $paginator->currentPage(),
                    'last_page'    => $paginator->lastPage(),
                    'per_page'     => $paginator->perPage(),
                    'total'        => $paginator->total(),
                ],
                'links' => [
                    'first' => $paginator->url(1),
                    'last'  => $paginator->url($paginator->lastPage()),
                    'prev'  => $paginator->previousPageUrl(),
                    'next'  => $paginator->nextPageUrl(),
                ],
            ],
        ]);
    }
}
