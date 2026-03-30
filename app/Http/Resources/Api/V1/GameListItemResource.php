<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GameListItemResource extends JsonResource
{
    /**
     * Transform one game model into dashboard selector data.
     *
     * @param  \Illuminate\Http\Request  $request  Current request context.
     * @return array<string, mixed> Serialized game fields used by the dashboard selector.
     * Logic: expose only the lightweight identifier and status fields needed to populate and update the game picker.
     *   `has_rematch` is a boolean derived from an EXISTS subquery in the repository; it is true when
     *   another game already references this game via rematch_from_game_id, so the frontend can
     *   suppress the rematch button for games that already have a successor.
     */
    public function toArray(Request $request): array
    {
        return [
            'id'                    => (int) $this->resource->id,
            'name'                  => $this->resource->name,
            'target_points'         => (int) $this->resource->target_points,
            'status'                => $this->resource->status,
            'winning_team_id'       => $this->resource->winning_team_id === null ? null : (int) $this->resource->winning_team_id,
            'rematch_from_game_id'  => $this->resource->rematch_from_game_id === null ? null : (int) $this->resource->rematch_from_game_id,
            'has_rematch'           => (bool) $this->resource->has_rematch,
            'current_round_number'  => (int) $this->resource->current_round_number,
            'user_role'             => $this->resource->user_role,
        ];
    }
}
