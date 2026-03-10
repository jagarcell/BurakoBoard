<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\UserListItemResource;
use App\Services\BurakoGameService;
use Illuminate\Http\JsonResponse;

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
}
