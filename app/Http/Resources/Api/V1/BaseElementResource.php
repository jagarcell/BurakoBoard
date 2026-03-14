<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BaseElementResource extends JsonResource
{
    /**
     * Transform one base element model into the scoring-input payload.
     *
     * @param  \Illuminate\Http\Request  $request  Current request context.
     * @return array<string, mixed> Serialized base element fields consumed by the round scoring form.
     * Logic: expose id, name, label, points, penalty, input_type, mutually_exclusive and score_override so the
     * frontend can render the correct input control (checkbox for boolean, number for quantity), calculate point
     * contributions, and apply penalty deductions when the element is not checked or has no quantity.
     */
    public function toArray(Request $request): array
    {
        return [
            'id'                 => (int) $this->resource->id,
            'name'               => $this->resource->name,
            'label'              => $this->resource->label,
            'points'             => (int) $this->resource->points,
            'penalty'            => (int) $this->resource->penalty,
            'input_type'         => $this->resource->input_type,
            'mutually_exclusive' => (bool) $this->resource->mutually_exclusive,
            'score_override'     => (bool) $this->resource->score_override,
        ];
    }
}
