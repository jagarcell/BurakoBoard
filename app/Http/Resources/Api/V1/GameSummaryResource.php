<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GameSummaryResource extends JsonResource
{
    /**
     * Transform summary payload into API array output.
     *
     * @param  \Illuminate\Http\Request  $request  Current request context.
     * @return array<string, mixed> Structured game, team, and round history data.
     * Logic: expose the normalized service summary keys without extra transformation so clients get stable contracts.
     */
    public function toArray(Request $request): array
    {
        return [
            'game' => $this->resource['game'],
            'teams' => $this->resource['teams'],
            'rounds' => $this->resource['rounds'],
            'round_roles' => $this->resource['round_roles'] ?? [],
        ];
    }
}
