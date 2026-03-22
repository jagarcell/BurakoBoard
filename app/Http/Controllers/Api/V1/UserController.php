<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\UserListItemResource;
use App\Services\BurakoGameService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\BurakoGameService  $service  Service that provides user data for player selection.
     * @return void Stores the service dependency used by this controller.
     * Logic: keep the controller thin by delegating all data retrieval to the service layer.
     */
    public function __construct(private readonly BurakoGameService $service)
    {
    }

    /**
     * Return a list of registered users available for player assignment.
     *
     * @return \Illuminate\Http\JsonResponse User list response.
     * Logic: delegate retrieval to the service and serialize each user through the dedicated list-item resource for player picker consumption.
     */
    public function index(): JsonResponse
    {
        $users = $this->service->listUsers();

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
     * Logic: read the optional page query parameter, delegate to the service with the current user id as the
     *   exclusion filter, then manually assemble the data/meta/links envelope around the transformed items
     *   so the invite modal receives a consistent, predictable pagination shape regardless of how the
     *   resource collection would behave when embedded inside response()->json().
     */
    public function indexInvitable(Request $request, int $gameId): JsonResponse
    {
        $page      = max(1, (int) $request->query('page', 1));
        $paginator = $this->service->listInvitableUsers($gameId, (int) $request->user()->id, $page);

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
