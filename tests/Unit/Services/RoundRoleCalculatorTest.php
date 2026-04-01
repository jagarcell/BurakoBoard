<?php

namespace Tests\Unit\Services;

use App\Services\RoundRoleCalculator;
use Tests\TestCase;

class RoundRoleCalculatorTest extends TestCase
{
    private RoundRoleCalculator $calculator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calculator = new RoundRoleCalculator();
    }

    private function makeTeamPayload(array $players): array
    {
        return [['id' => 1, 'name' => 'Team A', 'current_score' => 0, 'players' => $players]];
    }

    private function makePlayer(int $id, int $seat): array
    {
        return ['id' => $id, 'user_id' => null, 'display_name' => "Player {$id}", 'seat_number' => $seat];
    }

    public function test_returns_empty_array_when_initial_shuffler_seat_is_null(): void
    {
        $teamPayload = $this->makeTeamPayload([
            $this->makePlayer(1, 1),
            $this->makePlayer(2, 2),
            $this->makePlayer(3, 3),
            $this->makePlayer(4, 4),
        ]);

        $result = $this->calculator->compute($teamPayload, 0, null);

        $this->assertSame([], $result);
    }

    public function test_returns_empty_array_when_fewer_than_four_seated_players(): void
    {
        $teamPayload = $this->makeTeamPayload([
            $this->makePlayer(1, 1),
            $this->makePlayer(2, 2),
            $this->makePlayer(3, 3),
        ]);

        $result = $this->calculator->compute($teamPayload, 0, 1);

        $this->assertSame([], $result);
    }

    public function test_returns_empty_array_when_anchor_seat_not_found(): void
    {
        $teamPayload = $this->makeTeamPayload([
            $this->makePlayer(1, 1),
            $this->makePlayer(2, 2),
            $this->makePlayer(3, 3),
            $this->makePlayer(4, 4),
        ]);

        $result = $this->calculator->compute($teamPayload, 0, 99);

        $this->assertSame([], $result);
    }

    public function test_returns_one_round_when_current_round_number_is_zero(): void
    {
        $teamPayload = $this->makeTeamPayload([
            $this->makePlayer(1, 1),
            $this->makePlayer(2, 2),
            $this->makePlayer(3, 3),
            $this->makePlayer(4, 4),
        ]);

        $result = $this->calculator->compute($teamPayload, 0, 1);

        $this->assertCount(1, $result);
        $this->assertSame(1, $result[0]['round_number']);
        $this->assertSame(1, $result[0]['cutter']['player_id']);
        $this->assertSame(2, $result[0]['dealer']['player_id']);
        $this->assertSame(3, $result[0]['first_draw']['player_id']);
    }

    public function test_roles_rotate_by_one_seat_each_round(): void
    {
        $teamPayload = $this->makeTeamPayload([
            $this->makePlayer(1, 1),
            $this->makePlayer(2, 2),
            $this->makePlayer(3, 3),
            $this->makePlayer(4, 4),
        ]);

        $result = $this->calculator->compute($teamPayload, 2, 1);

        $this->assertCount(3, $result);

        // Round 1: anchor at seat 1
        $this->assertSame(1, $result[0]['cutter']['player_id']);
        $this->assertSame(2, $result[0]['dealer']['player_id']);
        $this->assertSame(3, $result[0]['first_draw']['player_id']);

        // Round 2: anchor advances to seat 2
        $this->assertSame(2, $result[1]['cutter']['player_id']);
        $this->assertSame(3, $result[1]['dealer']['player_id']);
        $this->assertSame(4, $result[1]['first_draw']['player_id']);

        // Round 3: anchor advances to seat 3
        $this->assertSame(3, $result[2]['cutter']['player_id']);
        $this->assertSame(4, $result[2]['dealer']['player_id']);
        $this->assertSame(1, $result[2]['first_draw']['player_id']);
    }

    public function test_rotation_wraps_around_when_last_seat_is_anchor(): void
    {
        $teamPayload = $this->makeTeamPayload([
            $this->makePlayer(1, 1),
            $this->makePlayer(2, 2),
            $this->makePlayer(3, 3),
            $this->makePlayer(4, 4),
        ]);

        // Anchor starts at seat 4 (last seat)
        $result = $this->calculator->compute($teamPayload, 0, 4);

        $this->assertCount(1, $result);
        $this->assertSame(4, $result[0]['cutter']['player_id']);
        $this->assertSame(1, $result[0]['dealer']['player_id']);
        $this->assertSame(2, $result[0]['first_draw']['player_id']);
    }

    public function test_unseated_players_are_excluded_from_roles(): void
    {
        $teamPayload = $this->makeTeamPayload([
            $this->makePlayer(1, 1),
            ['id' => 99, 'user_id' => null, 'display_name' => 'No Seat', 'seat_number' => null],
            $this->makePlayer(2, 2),
            $this->makePlayer(3, 3),
            $this->makePlayer(4, 4),
        ]);

        $result = $this->calculator->compute($teamPayload, 0, 1);

        $this->assertCount(1, $result);
        $seatedIds = [
            $result[0]['cutter']['player_id'],
            $result[0]['dealer']['player_id'],
            $result[0]['first_draw']['player_id'],
        ];
        $this->assertNotContains(99, $seatedIds);
    }

    /**
     * Verify that the cutter seat_number advances by exactly one each round over a full four-round
     * sequence, confirming the offset formula iterates through all seats in order.
     *
     * @return void Asserts seat_number 1→2→3→4 across rounds 1 to 4.
     * Logic: with currentRoundNumber=3 the calculator produces max(1, 3+1)=4 entries; offset 0–3
     *   maps to seatedPlayers[0–3], so seat_numbers are 1, 2, 3, 4 respectively.
     */
    public function test_cutter_seat_number_advances_by_one_each_round_over_four_rounds(): void
    {
        $teamPayload = $this->makeTeamPayload([
            $this->makePlayer(1, 1),
            $this->makePlayer(2, 2),
            $this->makePlayer(3, 3),
            $this->makePlayer(4, 4),
        ]);

        // currentRoundNumber=3 → max(1, 3+1)=4 rounds generated
        $result = $this->calculator->compute($teamPayload, 3, 1);

        $this->assertCount(4, $result);

        // Round 1: offset=0, cutter at seatedPlayers[0] → seat 1
        $this->assertSame(1, $result[0]['cutter']['seat_number']);
        // Round 2: offset=1, cutter at seatedPlayers[1] → seat 2
        $this->assertSame(2, $result[1]['cutter']['seat_number']);
        // Round 3: offset=2, cutter at seatedPlayers[2] → seat 3
        $this->assertSame(3, $result[2]['cutter']['seat_number']);
        // Round 4: offset=3, cutter at seatedPlayers[3] → seat 4
        $this->assertSame(4, $result[3]['cutter']['seat_number']);
    }

    /**
     * Verify that the rotation wraps back to the starting seat after a complete cycle of four rounds.
     *
     * @return void Asserts the fifth round's cutter returns to seat 1 (the anchor seat).
     * Logic: with currentRoundNumber=4 the calculator produces 5 entries; offset=4 →
     *   (initialIndex + 4) % 4 = 0, so the cutter is back at the anchor (seat 1, player 1).
     */
    public function test_rotation_wraps_back_to_anchor_after_full_cycle(): void
    {
        $teamPayload = $this->makeTeamPayload([
            $this->makePlayer(1, 1),
            $this->makePlayer(2, 2),
            $this->makePlayer(3, 3),
            $this->makePlayer(4, 4),
        ]);

        // currentRoundNumber=4 → 5 rounds; round 5 (offset=4) wraps: (0+4)%4=0
        $result = $this->calculator->compute($teamPayload, 4, 1);

        $this->assertCount(5, $result);
        $this->assertSame(5, $result[4]['round_number']);
        $this->assertSame(1, $result[4]['cutter']['seat_number']);
        $this->assertSame(1, $result[4]['cutter']['player_id']);
    }
}
