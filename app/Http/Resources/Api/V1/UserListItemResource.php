<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserListItemResource extends JsonResource
{
    /**
     * Transform one user into the player-selection payload.
     *
     * @param  \Illuminate\Http\Request  $request  Current request context.
     * @return array<string, mixed> Serialized user fields needed by the team creation dialog.
     * Logic: expose only id and name so the frontend can populate a registered-player picker without receiving sensitive user attributes.
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (int) $this->resource->id,
            'name' => $this->resource->name,
        ];
    }
}
