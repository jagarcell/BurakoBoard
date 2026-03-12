<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\BaseElementResource;
use App\Services\BurakoGameService;
use Illuminate\Http\JsonResponse;

class BaseElementController extends Controller
{
    /**
     * Construct the controller with its domain service.
     *
     * @param  \App\Services\BurakoGameService  $service  Service that provides base element data.
     * @return void Stores the service dependency used by this controller.
     * Logic: keep the controller thin by delegating all retrieval of scoring elements to the service layer.
     */
    public function __construct(private readonly BurakoGameService $service)
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
