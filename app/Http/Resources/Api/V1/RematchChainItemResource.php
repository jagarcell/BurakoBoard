<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RematchChainItemResource extends JsonResource
{
    /**
     * Transform one game row into a rematch-chain list item.
     *
     * @param  \Illuminate\Http\Request  $request  Current request context.
     * @return array<string, mixed> Lightweight game fields needed to render the rematch chain.
     * Logic: expose only the fields required to identify each game in a rematch chain and determine
     *   its position in the sequence; rematch_from_game_id lets the client reconstruct the DAG
     *   if needed, while status and winning_team_id communicate the game's current outcome.
     *   team_scores is mapped from the virtual attribute attached by the repository so the
     *   frontend can render per-team final scores without an additional API request.
     */
    public function toArray(Request $request): array
    {
        return [
            'id'                    => (int) $this->resource->id,
            'name'                  => $this->resource->name,
            'target_points'         => (int) $this->resource->target_points,
            'status'                => $this->resource->status,
            'winning_team_id'       => $this->resource->winning_team_id === null ? null : (int) $this->resource->winning_team_id,
            'current_round_number'  => (int) $this->resource->current_round_number,
            'rematch_from_game_id'  => $this->resource->rematch_from_game_id === null ? null : (int) $this->resource->rematch_from_game_id,
            'team_scores'           => collect($this->resource->team_scores ?? [])->map(fn (object $ts): array => [
                'team_id'       => (int) $ts->team_id,
                'team_name'     => $ts->team_name,
                'current_score' => (int) $ts->current_score,
            ])->values()->all(),
        ];
    }
}
