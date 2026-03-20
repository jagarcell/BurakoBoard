<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreVoiceAliasRequest;
use App\Http\Resources\UserVoiceAliasResource;
use App\Services\UserVoiceAliasService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
     * @return JsonResponse JSON object with an `aliases` key containing the array.
     *
     * Logic: Loads aliases scoped to the current user and returns them under a named
     *   `aliases` key so the EnsureApiResponseEnvelope middleware produces a single-level
     *   `data.aliases` path — consistent with other list endpoints (e.g. BaseElementController
     *   uses `data.base_elements`). Avoids the double-nesting caused by returning a
     *   ResourceCollection directly, which adds its own `{ data: [] }` wrapper.
     */
    public function index(Request $request): JsonResponse
    {
        $aliases = $this->service->getAliasesForUser($request->user()->id);

        return response()->json(['aliases' => UserVoiceAliasResource::collection($aliases)]);
    }

    /**
     * Create a new voice alias for the authenticated user, or return the existing one.
     *
     * @param StoreVoiceAliasRequest $request Validated request containing alias and keyword.
     * @return JsonResponse 201 when a new alias was created; 200 when the alias already existed.
     *
     * Logic: Delegates to the service which performs a find-or-create. Returns 201 for
     *   newly created aliases and 200 for duplicates, so callers never receive a 4xx for
     *   an alias they already own — avoiding spurious browser console errors.
     */
    public function store(StoreVoiceAliasRequest $request): JsonResponse
    {
        [$alias, $wasCreated] = $this->service->findOrCreateAlias(
            $request->user()->id,
            $request->validated('alias'),
            $request->validated('keyword'),
        );

        return response()->json(new UserVoiceAliasResource($alias), $wasCreated ? 201 : 200);
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
