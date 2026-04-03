<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\CardWeightService;
use Illuminate\Http\JsonResponse;

class CardWeightController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\CardWeightService  $service  Service that provides card weight data.
     * @return void
     * Logic: Keep the controller thin by delegating all retrieval to the service layer.
     */
    public function __construct(private readonly CardWeightService $service)
    {
    }

    /**
     * Return the full list of card weights ordered by sort_order.
     *
     * @return \Illuminate\Http\JsonResponse Card weights response.
     * Logic: Delegates to the service (which wraps the result in a Redis cache) and returns
     * the collection under a descriptive 'card_weights' key. This endpoint is public and
     * read-only — it exposes no personal data, only static catalogue values.
     */
    public function index(): JsonResponse
    {
        $weights = $this->service->getAll();

        return response()->json([
            'card_weights' => $weights,
        ]);
    }
}
