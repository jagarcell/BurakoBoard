<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreVoiceAliasRequest;
use App\Http\Resources\UserVoiceAliasResource;
use App\Services\UserVoiceAliasService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class UserVoiceAliasController extends Controller
{
    /**
     * @param UserVoiceAliasService $service
     * @return void
     *
     * Logic: Stores the service dependency injected by the service container.
     */
    public function __construct(private readonly UserVoiceAliasService $service)
    {
    }

    /**
     * Return all voice aliases for the authenticated user.
     *
     * @param Request $request The incoming HTTP request (provides authenticated user).
     * @return AnonymousResourceCollection JSON array of UserVoiceAliasResource objects.
     *
     * Logic: Loads aliases scoped to the current user via the service and wraps them
     *   in a typed resource collection so the response shape is consistent.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $aliases = $this->service->getAliasesForUser($request->user()->id);

        return UserVoiceAliasResource::collection($aliases);
    }

    /**
     * Create a new voice alias for the authenticated user.
     *
     * @param StoreVoiceAliasRequest $request Validated request containing alias and keyword.
     * @return JsonResponse 201 response with the created alias resource.
     *
     * Logic: Passes the pre-validated (and normalised) alias/keyword to the service,
     *   then returns the created model wrapped in the resource with a 201 status.
     */
    public function store(StoreVoiceAliasRequest $request): JsonResponse
    {
        $alias = $this->service->addAlias(
            $request->user()->id,
            $request->validated('alias'),
            $request->validated('keyword'),
        );

        return response()->json(new UserVoiceAliasResource($alias), 201);
    }

    /**
     * Delete a specific voice alias owned by the authenticated user.
     *
     * @param Request $request  The incoming HTTP request (provides authenticated user).
     * @param int     $aliasId  The primary key of the alias to delete.
     * @return JsonResponse 204 on success; 404 if not found or not owned by this user.
     *
     * Logic: Delegates to the service with both the alias ID and user ID so the
     *   repository can enforce ownership. Returns 404 rather than 403 to avoid
     *   leaking the existence of aliases belonging to other users.
     */
    public function destroy(Request $request, int $aliasId): JsonResponse
    {
        $deleted = $this->service->removeAlias($aliasId, $request->user()->id);

        return $deleted
            ? response()->json(['message' => 'Voice alias removed.'], 200)
            : response()->json(['message' => 'Voice alias not found.'], 404);
    }
}
