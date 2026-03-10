<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TeamListItemResource extends JsonResource
{
    /**
     * Transform one team into the selector payload.
     *
     * @param  \Illuminate\Http\Request  $request  Current request context.
     * @return array<string, mixed> Serialized team fields needed by the frontend team selector.
     * Logic: expose id, name, and players so the selector can display team options and copy player data when adding an existing team to a game.
     */
    public function toArray(Request $request): array
    {
        return [
            'id'      => (int) $this->resource->id,
            'name'    => $this->resource->name,
            'players' => $this->resource->players->map(fn ($player) => [
                'id'           => (int) $player->id,
                'user_id'      => $player->user_id !== null ? (int) $player->user_id : null,
                'display_name' => $player->display_name,
            ])->values()->all(),
        ];
    }
}
