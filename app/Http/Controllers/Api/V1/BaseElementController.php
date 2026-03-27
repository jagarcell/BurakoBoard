<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\BaseElementResource;
use App\Services\GameService;
use Illuminate\Http\JsonResponse;

class BaseElementController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\GameService  $service  Service that provides base element data.
     * @return void
     * Logic: keep the controller thin by delegating all retrieval of scoring elements to the service layer.
     */
    public function __construct(private readonly GameService $service)
    {
    }

    /**
     * Return the list of all base scoring elements.
     *
     * @return \Illuminate\Http\JsonResponse Base elements response.
     * Logic: delegate retrieval to the service and serialize each element through the dedicated resource
     * for front-end round scoring consumption; elements include input_type so the UI renders checkboxes
     * for boolean elements and numeric inputs for quantity elements.
     */
    public function index(): JsonResponse
    {
        $elements = $this->service->listBaseElements();

        return response()->json([
            'base_elements' => BaseElementResource::collection($elements),
        ]);
    }
}
