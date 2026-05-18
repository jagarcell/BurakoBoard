<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\UpsertRoundDraftRequest;
use App\Services\RoundDraftService;
use Illuminate\Http\JsonResponse;

class RoundDraftController extends Controller
{
    /**
     * Construct the controller with the round draft service dependency.
     *
     * @param  \App\Services\RoundDraftService  $service  Service that handles round draft business logic.
     * @return void
     * Logic: inject the focused draft service so draft operations stay consistent with
     *   the rest of the game workflow.
     */
    public function __construct(private readonly RoundDraftService $service)
    {
    }

    /**
     * Return the current round draft for a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Http\JsonResponse JSON payload with the draft or null.
     * Logic: delegate retrieval to the service and wrap the result in a consistent
     * data envelope; null is returned when no draft has been saved yet so the
     * frontend can distinguish between an empty draft and missing data.
     */
    public function show(int $gameId): JsonResponse
    {
        $draft = $this->service->getRoundDraft($gameId);

        return response()->json([
            'round_draft' => $draft === null ? null : [
                'base_inputs' => $draft->base_inputs,
                'card_inputs' => $draft->card_inputs,
            ],
        ]);
    }

    /**
     * Return the archived draft captured when a specific round was committed.
     *
     * @param  int  $gameId      Identifier of the game.
     * @param  int  $roundNumber The round number whose draft should be retrieved.
     * @return \Illuminate\Http\JsonResponse JSON payload with the archived draft or null.
     * Logic: delegate retrieval to the service and wrap the result in a consistent data
     * envelope; null is returned when no draft was captured for that round (e.g. the
     * round was recorded before draft archiving was introduced).
     */
    public function showByRound(int $gameId, int $roundNumber): JsonResponse
    {
        $draft = $this->service->getRoundDraftForRound($gameId, $roundNumber);

        return response()->json([
            'round_draft' => $draft === null ? null : [
                'base_inputs' => $draft->base_inputs,
                'card_inputs' => $draft->card_inputs,
            ],
        ]);
    }

    /**
     * Create or update the round draft for a game.
     *
     * @param  \App\Http\Requests\Api\V1\UpsertRoundDraftRequest  $request  Validated draft payload.
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Http\JsonResponse JSON payload with the saved draft.
     * Logic: delegate persistence to the service and return the saved draft in a
     * consistent data envelope so the frontend can confirm what was stored.
     */
    public function upsert(UpsertRoundDraftRequest $request, int $gameId): JsonResponse
    {
        $draft = $this->service->saveRoundDraft($gameId, $request->validated());

        return response()->json([
            'round_draft' => [
                'base_inputs' => $draft->base_inputs,
                'card_inputs' => $draft->card_inputs,
            ],
        ]);
    }

    /**
     * Delete the active round draft for a game.
     *
     * @param  int  $gameId  Identifier of the game whose active draft should be deleted.
     * @return \Illuminate\Http\JsonResponse Empty 204 No Content response.
     * Logic: delegate deletion to the service (which verifies game existence), then return
     *   a 204 so the frontend knows the stale draft has been removed. Used after a round
     *   is recorded to prevent an in-flight auto-save PUT from leaving behind a stale draft
     *   that would be loaded back into cleared inputs on the next fetchRoundDraft call.
     */
    public function destroy(int $gameId): JsonResponse
    {
        $this->service->deleteRoundDraft($gameId);

        return response()->json(null, 204);
    }
}
