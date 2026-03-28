<?php

namespace App\Services;

use Illuminate\Support\Collection;

class RoundRoleCalculator
{
    /**
     * Compute seat-based round roles (cutter, dealer, first draw) for each played and upcoming round.
     *
     * @param  array<int, array<string, mixed>>  $teamPayload             Team payload with players that include seat numbers.
     * @param  int                               $currentRoundNumber      Last completed round number from the game row.
     * @param  int|null                          $initialShufflerSeatNumber  Seat number selected as the initial cutter anchor.
     * @return array<int, array<string, mixed>> Round role assignments ordered by round number.
     * Logic: flatten all seated players from the team payload ordered by seat_number, locate the
     *   anchor player whose seat matches initialShufflerSeatNumber, then rotate indices by one seat
     *   each round so the cutter advances, the dealer is the next seat, and first draw is the seat
     *   after dealer. Returns an empty array when the seat anchor is unset or fewer than four
     *   players are seated, since roles cannot be determined without a full table.
     */
    public function compute(array $teamPayload, int $currentRoundNumber, ?int $initialShufflerSeatNumber): array
    {
        $seatedPlayers = collect($teamPayload)
            ->flatMap(fn (array $team): array => $team['players'] ?? [])
            ->filter(fn (array $player): bool => $player['seat_number'] !== null)
            ->sortBy('seat_number')
            ->values();

        if ($initialShufflerSeatNumber === null || $seatedPlayers->count() < 4) {
            return [];
        }

        $initialIndex = $seatedPlayers->search(
            fn (array $player): bool => (int) $player['seat_number'] === $initialShufflerSeatNumber,
        );

        if ($initialIndex === false) {
            return [];
        }

        $roundCount   = max(1, $currentRoundNumber + 1);
        $totalPlayers = $seatedPlayers->count();
        $roundRoles   = [];

        for ($roundOffset = 0; $roundOffset < $roundCount; $roundOffset++) {
            $cutter    = $seatedPlayers[($initialIndex + $roundOffset) % $totalPlayers];
            $dealer    = $seatedPlayers[($initialIndex + $roundOffset + 1) % $totalPlayers];
            $firstDraw = $seatedPlayers[($initialIndex + $roundOffset + 2) % $totalPlayers];

            $roundRoles[] = [
                'round_number' => $roundOffset + 1,
                'cutter'       => [
                    'player_id'    => (int) $cutter['id'],
                    'display_name' => $cutter['display_name'],
                    'seat_number'  => (int) $cutter['seat_number'],
                ],
                'dealer'       => [
                    'player_id'    => (int) $dealer['id'],
                    'display_name' => $dealer['display_name'],
                    'seat_number'  => (int) $dealer['seat_number'],
                ],
                'first_draw'   => [
                    'player_id'    => (int) $firstDraw['id'],
                    'display_name' => $firstDraw['display_name'],
                    'seat_number'  => (int) $firstDraw['seat_number'],
                ],
            ];
        }

        return $roundRoles;
    }
}
