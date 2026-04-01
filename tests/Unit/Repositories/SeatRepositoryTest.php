<?php

namespace Tests\Unit\Repositories;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Repositories\SeatRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SeatRepositoryTest extends TestCase
{
    use RefreshDatabase;

    private SeatRepository $repository;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = new SeatRepository();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Create a minimal in-progress game.
     *
     * @return Game A fresh game row.
     * Logic: inserts a game with the minimum required fields so tests can attach teams to it.
     */
    private function makeGame(): Game
    {
        return Game::create([
            'name'                 => 'Test Game',
            'target_points'        => 2000,
            'status'               => 'in_progress',
            'winning_team_id'      => null,
            'current_round_number' => 0,
        ]);
    }

    /**
     * Create a team with the given display name.
     *
     * @param  string  $name  Team display name.
     * @return Team A fresh team row.
     * Logic: inserts the team row; its auto-incremented ID determines its slot order in a game.
     */
    private function makeTeam(string $name = 'Team'): Team
    {
        return Team::create(['name' => $name]);
    }

    /**
     * Create a player with the given display name.
     *
     * @param  string  $name  Player display name.
     * @return Player A fresh player row with no linked user.
     * Logic: inserts the player row so it can be attached to teams and seated in games.
     */
    private function makePlayer(string $name = 'Player'): Player
    {
        return Player::create(['user_id' => null, 'display_name' => $name]);
    }

    /**
     * Register a team as a participant of a game via the game_team pivot.
     *
     * @param  Game  $game  The game to attach the team to.
     * @param  Team  $team  The team to attach.
     * @return void Inserts a game_team row with a zero starting score.
     * Logic: direct DB insert mirrors what the application writes when a team is added to a game.
     */
    private function attachTeamToGame(Game $game, Team $team): void
    {
        DB::table('game_team')->insert([
            'game_id'       => $game->id,
            'team_id'       => $team->id,
            'current_score' => 0,
        ]);
    }

    /**
     * Read the seat_number for a player in a specific game from game_player_seat.
     *
     * @param  int  $gameId    Game identifier.
     * @param  int  $playerId  Player identifier.
     * @return int|null The seat number, or null when no row exists.
     * Logic: direct DB lookup so tests are not coupled to any repository method other than the
     *   one under test.
     */
    private function seatOf(int $gameId, int $playerId): ?int
    {
        $row = DB::table('game_player_seat')
            ->where('game_id', $gameId)
            ->where('player_id', $playerId)
            ->first();

        return $row ? (int) $row->seat_number : null;
    }

    // -------------------------------------------------------------------------
    // assignPlayerSeat — happy path
    // -------------------------------------------------------------------------

    /**
     * Verify that the first player added to the lower-ID team (slot 0) receives seat 1.
     *
     * @return void Asserts seat_number equals 1 for a slot-0 player with no previously seated team-mates.
     * Logic: slot 0 → existingCount=0 → 0*2+1=1.
     */
    public function test_assign_player_seat_gives_odd_seat_to_slot_zero_player(): void
    {
        $game     = $this->makeGame();
        $teamLow  = $this->makeTeam('Low');  // lower ID → slot 0
        $teamHigh = $this->makeTeam('High'); // higher ID → slot 1
        $this->attachTeamToGame($game, $teamLow);
        $this->attachTeamToGame($game, $teamHigh);

        $player = $this->makePlayer('Alice');
        $teamLow->players()->attach($player->id);

        $this->repository->assignPlayerSeat($game->id, $teamLow->id, $player->id);

        $this->assertSame(1, $this->seatOf($game->id, $player->id));
    }

    /**
     * Verify that the first player added to the higher-ID team (slot 1) receives seat 2.
     *
     * @return void Asserts seat_number equals 2 for a slot-1 player with no previously seated team-mates.
     * Logic: slot 1 → existingCount=0 → 0*2+2=2.
     */
    public function test_assign_player_seat_gives_even_seat_to_slot_one_player(): void
    {
        $game     = $this->makeGame();
        $teamLow  = $this->makeTeam('Low');
        $teamHigh = $this->makeTeam('High');
        $this->attachTeamToGame($game, $teamLow);
        $this->attachTeamToGame($game, $teamHigh);

        $player = $this->makePlayer('Bob');
        $teamHigh->players()->attach($player->id);

        $this->repository->assignPlayerSeat($game->id, $teamHigh->id, $player->id);

        $this->assertSame(2, $this->seatOf($game->id, $player->id));
    }

    /**
     * Verify that slot assignment is determined by teams.id order rather than game_team insertion order.
     *
     * @return void Asserts the higher-ID team is still slot 1 even when it was registered in game_team first.
     * Logic: the repository orders by teams.id when computing the slot index; insertion order into
     *   game_team is irrelevant. teamHigh (higher ID) must be slot 1 → seat 2.
     */
    public function test_assign_player_seat_uses_teams_id_order_not_insertion_order(): void
    {
        $game     = $this->makeGame();
        $teamLow  = $this->makeTeam('Low');  // lower teams.id → slot 0
        $teamHigh = $this->makeTeam('High'); // higher teams.id → slot 1

        // Insert the HIGHER-ID team into game_team first to simulate out-of-order registration.
        $this->attachTeamToGame($game, $teamHigh);
        $this->attachTeamToGame($game, $teamLow);

        $player = $this->makePlayer('Charlie');
        $teamHigh->players()->attach($player->id);

        $this->repository->assignPlayerSeat($game->id, $teamHigh->id, $player->id);

        // teamHigh must be slot 1 (higher teams.id) → seat 2, not slot 0 → seat 1
        $this->assertSame(2, $this->seatOf($game->id, $player->id));
    }

    /**
     * Verify that the second player added to slot 0 receives seat 3 (not seat 1 again).
     *
     * @return void Asserts seat_number equals 3 when slot 0 already has one seated player.
     * Logic: existingCount=1 for the team → 1*2+1=3.
     */
    public function test_assign_player_seat_second_player_in_slot_zero_gets_seat_three(): void
    {
        $game     = $this->makeGame();
        $teamLow  = $this->makeTeam('Low');
        $teamHigh = $this->makeTeam('High');
        $this->attachTeamToGame($game, $teamLow);
        $this->attachTeamToGame($game, $teamHigh);

        // Seat an existing slot-0 player at seat 1 so the repository sees existingCount=1.
        $firstPlayer = $this->makePlayer('First');
        $teamLow->players()->attach($firstPlayer->id);
        DB::table('game_player_seat')->insert([
            'game_id'     => $game->id,
            'player_id'   => $firstPlayer->id,
            'seat_number' => 1,
        ]);

        $secondPlayer = $this->makePlayer('Second');
        $teamLow->players()->attach($secondPlayer->id);

        $this->repository->assignPlayerSeat($game->id, $teamLow->id, $secondPlayer->id);

        $this->assertSame(3, $this->seatOf($game->id, $secondPlayer->id));
    }

    /**
     * Verify that the first player added to slot 1 receives seat 2 even when slot 0 already has
     * two seated players.
     *
     * @return void Asserts seat_number equals 2 for slot-1 player when slot-0 count is irrelevant.
     * Logic: existingCount is scoped per team; slot 1's count is 0 → 0*2+2=2 regardless of how
     *   many slot-0 players are seated.
     */
    public function test_assign_player_seat_slot_one_first_player_gets_seat_two_regardless_of_slot_zero_count(): void
    {
        $game     = $this->makeGame();
        $teamLow  = $this->makeTeam('Low');
        $teamHigh = $this->makeTeam('High');
        $this->attachTeamToGame($game, $teamLow);
        $this->attachTeamToGame($game, $teamHigh);

        // Seat two players in slot 0 (seats 1 and 3) to establish a non-zero existing count there.
        foreach ([1, 3] as $seatNumber) {
            $p = $this->makePlayer("SlotZeroPlayer{$seatNumber}");
            $teamLow->players()->attach($p->id);
            DB::table('game_player_seat')->insert([
                'game_id'     => $game->id,
                'player_id'   => $p->id,
                'seat_number' => $seatNumber,
            ]);
        }

        $player = $this->makePlayer('SlotOneFirst');
        $teamHigh->players()->attach($player->id);

        $this->repository->assignPlayerSeat($game->id, $teamHigh->id, $player->id);

        // existingCount for teamHigh = 0 → 0*2+2 = 2
        $this->assertSame(2, $this->seatOf($game->id, $player->id));
    }

    // -------------------------------------------------------------------------
    // assignPlayerSeat — edge case: team not in game
    // -------------------------------------------------------------------------

    /**
     * Verify that no seat row is written when the team is not registered in the game.
     *
     * @return void Asserts game_player_seat has no row for the player after the call.
     * Logic: when game_team has no row matching (game_id, team_id), the slot search returns false
     *   and the method silently returns without inserting.
     */
    public function test_assign_player_seat_is_noop_when_team_not_in_game(): void
    {
        $game   = $this->makeGame();
        $team   = $this->makeTeam('Floating');
        // Deliberately NOT calling attachTeamToGame so game_team has no row for this team.
        $player = $this->makePlayer('Nobody');
        $team->players()->attach($player->id);

        $this->repository->assignPlayerSeat($game->id, $team->id, $player->id);

        $this->assertNull($this->seatOf($game->id, $player->id));
    }

    // -------------------------------------------------------------------------
    // reassignAllSeatsForGame
    // -------------------------------------------------------------------------

    /**
     * Verify that reassigning seats from scratch produces the correct interleaved seat numbers.
     *
     * @return void Asserts slot-0 players receive odd seats (1, 3) and slot-1 players even seats (2, 4).
     * Logic: reassignAllSeatsForGame iterates teams ordered by teams.id; within each team players
     *   are ordered by player.id. Formula: slot 0 → position*2+1; slot 1 → position*2+2.
     */
    public function test_reassign_all_seats_produces_correct_interleaved_seats(): void
    {
        $game     = $this->makeGame();
        $teamLow  = $this->makeTeam('Low');
        $teamHigh = $this->makeTeam('High');
        $this->attachTeamToGame($game, $teamLow);
        $this->attachTeamToGame($game, $teamHigh);

        // Create players in ascending ID order so position index is deterministic.
        $playerA1 = $this->makePlayer('A1');
        $teamLow->players()->attach($playerA1->id);
        $playerA2 = $this->makePlayer('A2');
        $teamLow->players()->attach($playerA2->id);
        $playerB1 = $this->makePlayer('B1');
        $teamHigh->players()->attach($playerB1->id);
        $playerB2 = $this->makePlayer('B2');
        $teamHigh->players()->attach($playerB2->id);

        $this->repository->reassignAllSeatsForGame($game->id);

        // slot 0 (teamLow) – ordered by player_id ascending
        $this->assertSame(1, $this->seatOf($game->id, $playerA1->id)); // position 0 → 0*2+1=1
        $this->assertSame(3, $this->seatOf($game->id, $playerA2->id)); // position 1 → 1*2+1=3
        // slot 1 (teamHigh) – ordered by player_id ascending
        $this->assertSame(2, $this->seatOf($game->id, $playerB1->id)); // position 0 → 0*2+2=2
        $this->assertSame(4, $this->seatOf($game->id, $playerB2->id)); // position 1 → 1*2+2=4
    }

    /**
     * Verify that reassignAllSeatsForGame corrects seat numbers when the higher-ID team was
     * registered in game_team before the lower-ID team.
     *
     * @return void Asserts the lower-ID team ends up in slot 0 (odd seats) and the higher-ID team
     *   ends up in slot 1 (even seats) regardless of insertion order into game_team.
     * Logic: the method sorts by teams.id, so whichever team was inserted first into game_team
     *   does not affect the final slot index. Any pre-existing wrong seats are cleared and replaced.
     */
    public function test_reassign_all_seats_corrects_seats_when_higher_id_team_was_inserted_first(): void
    {
        $game     = $this->makeGame();
        $teamLow  = $this->makeTeam('Low');  // lower teams.id → must become slot 0
        $teamHigh = $this->makeTeam('High'); // higher teams.id → must become slot 1

        // Register the HIGHER-ID team first to simulate out-of-order attachment.
        $this->attachTeamToGame($game, $teamHigh);
        $this->attachTeamToGame($game, $teamLow);

        // Players created in this order: High1 < High2 < Low1 < Low2 (by player_id)
        $playerHigh1 = $this->makePlayer('High1');
        $teamHigh->players()->attach($playerHigh1->id);
        $playerHigh2 = $this->makePlayer('High2');
        $teamHigh->players()->attach($playerHigh2->id);
        $playerLow1 = $this->makePlayer('Low1');
        $teamLow->players()->attach($playerLow1->id);
        $playerLow2 = $this->makePlayer('Low2');
        $teamLow->players()->attach($playerLow2->id);

        // Insert deliberately wrong seats (as if teamHigh was treated as slot 0).
        DB::table('game_player_seat')->insert([
            ['game_id' => $game->id, 'player_id' => $playerHigh1->id, 'seat_number' => 1],
            ['game_id' => $game->id, 'player_id' => $playerHigh2->id, 'seat_number' => 3],
            ['game_id' => $game->id, 'player_id' => $playerLow1->id,  'seat_number' => 2],
            ['game_id' => $game->id, 'player_id' => $playerLow2->id,  'seat_number' => 4],
        ]);

        $this->repository->reassignAllSeatsForGame($game->id);

        // After reassignment, teams.id order governs the slot:
        // teamLow (slot 0) → odd seats 1, 3
        $this->assertSame(1, $this->seatOf($game->id, $playerLow1->id));
        $this->assertSame(3, $this->seatOf($game->id, $playerLow2->id));
        // teamHigh (slot 1) → even seats 2, 4
        $this->assertSame(2, $this->seatOf($game->id, $playerHigh1->id));
        $this->assertSame(4, $this->seatOf($game->id, $playerHigh2->id));
    }
}
