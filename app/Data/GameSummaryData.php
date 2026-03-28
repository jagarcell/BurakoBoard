<?php

namespace App\Data;

use App\Models\Game;
use Illuminate\Support\Collection;

final class GameSummaryData
{
    /**
     * Lightweight read-model carrying the raw DB result sets needed to assemble a full game summary.
     *
     * @param  \App\Models\Game                $game           Hydrated game model.
     * @param  \Illuminate\Support\Collection  $teams          Query-builder rows from game_team JOIN teams (id, name, current_score).
     * @param  \Illuminate\Support\Collection  $playersByTeam  Player rows grouped by team_id.
     * @param  \Illuminate\Support\Collection  $roundRows      Round-score rows ordered by round_number then team id.
     * @return void
     * Logic: store the raw query results so the resource layer can assemble the API contract
     *   without the repository needing to know anything about the presentation shape.
     */
    public function __construct(
        public readonly Game $game,
        public readonly Collection $teams,
        public readonly Collection $playersByTeam,
        public readonly Collection $roundRows,
    ) {}
}
