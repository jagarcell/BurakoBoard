<?php

namespace App\Http\Resources\Api\V1;

use App\Data\GameSummaryData;
use App\Services\RoundRoleCalculator;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

class GameSummaryResource extends JsonResource
{
    /**
     * Transform a GameSummaryData value object into the API response array.
     *
     * @param  \Illuminate\Http\Request  $request  Current request context.
     * @return array<string, mixed> Fully assembled game, team, round, and round-role payload.
     * Logic: assembles teamPayload by mapping raw query-builder rows from GameSummaryData, builds
     *   the rounds array by grouping round-score rows by round_number, then delegates round-role
     *   computation to RoundRoleCalculator — a pure function with no database dependency.
     *   This keeps the repository responsible only for fetching raw data and this resource
     *   responsible for shaping it into the API contract.
     */
    public function toArray(Request $request): array
    {
        /** @var GameSummaryData $data */
        $data = $this->resource;

        $teamPayload = $data->teams->map(function ($team) use ($data): array {
            $teamPlayers = $data->playersByTeam->get($team->id, collect())
                ->map(fn ($player): array => [
                    'id'           => (int) $player->player_id,
                    'user_id'      => $player->user_id === null ? null : (int) $player->user_id,
                    'display_name' => $player->display_name,
                    'seat_number'  => $player->seat_number !== null ? (int) $player->seat_number : null,
                ])
                ->values()
                ->all();

            return [
                'id'            => (int) $team->id,
                'name'          => $team->name,
                'current_score' => (int) $team->current_score,
                'players'       => $teamPlayers,
            ];
        })->values()->all();

        $rounds = $data->roundRows
            ->groupBy('round_number')
            ->map(function (Collection $scores, int|string $roundNumber): array {
                return [
                    'round_number' => (int) $roundNumber,
                    'scores'       => $scores->map(fn ($score): array => [
                        'team_id'   => (int) $score->team_id,
                        'team_name' => $score->team_name,
                        'points'    => (int) $score->points,
                    ])->values()->all(),
                ];
            })
            ->values()
            ->all();

        $roundRoles = (new RoundRoleCalculator())->compute(
            $teamPayload,
            (int) $data->game->current_round_number,
            $data->game->initial_shuffler_seat_number !== null
                ? (int) $data->game->initial_shuffler_seat_number
                : null,
        );

        return [
            'game' => [
                'id'                            => $data->game->id,
                'name'                          => $data->game->name,
                'target_points'                 => $data->game->target_points,
                'status'                        => $data->game->status,
                'winning_team_id'               => $data->game->winning_team_id,
                'rematch_from_game_id'          => $data->game->rematch_from_game_id,
                'current_round_number'          => $data->game->current_round_number,
                'initial_shuffler_seat_number'  => $data->game->initial_shuffler_seat_number,
            ],
            'teams'       => $teamPayload,
            'rounds'      => $rounds,
            'round_roles' => $roundRoles,
        ];
    }
}
