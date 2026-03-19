<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PlayerSeatSwapTest extends TestCase
{
    use RefreshDatabase;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function makeGame(string $status = 'in_progress'): Game
    {
        return Game::query()->create([
            'name'                 => 'Test Game',
            'target_points'        => 2000,
            'status'               => $status,
            'winning_team_id'      => null,
            'current_round_number' => 0,
        ]);
    }

    private function makeTeam(Game $game, string $name = 'Team Alpha'): Team
    {
        $team = Team::query()->create(['name' => $name]);
        DB::table('game_team')->insert([
            'game_id'       => $game->id,
            'team_id'       => $team->id,
            'current_score' => 0,
        ]);

        return $team;
    }

    private function makePlayer(Team $team, string $name, int $gameId, int $seatNumber): Player
    {
        $player = Player::query()->create(['user_id' => null, 'display_name' => $name]);
        DB::table('team_player')->insert([
            'team_id'    => $team->id,
            'player_id'  => $player->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('game_player_seat')->insert([
            'game_id'     => $gameId,
            'player_id'   => $player->id,
            'seat_number' => $seatNumber,
        ]);

        return $player;
    }

    // -------------------------------------------------------------------------
    // Happy-path tests
    // -------------------------------------------------------------------------

    /**
     * Verify that two players' seats are exchanged and the summary reflects the new order.
     *
     * @return void The swap endpoint returns 200 with both players' seat numbers exchanged.
     * Logic: set up two seated players, call the swap endpoint, and assert the seat numbers
     * are reversed in the response and in the database.
     */
    public function test_swaps_two_players_seats_successfully(): void
    {
        $game    = $this->makeGame();
        $team    = $this->makeTeam($game);
        $playerA = $this->makePlayer($team, 'Alice', $game->id, 1);
        $playerB = $this->makePlayer($team, 'Bob',   $game->id, 3);

        $response = $this->putJson("/api/v1/games/{$game->id}/players/swap-seats", [
            'player_id_a' => $playerA->id,
            'player_id_b' => $playerB->id,
        ]);

        $response->assertStatus(200);

        // Assert seat numbers flipped in the database.
        $this->assertDatabaseHas('game_player_seat', [
            'game_id'     => $game->id,
            'player_id'   => $playerA->id,
            'seat_number' => 3,
        ]);
        $this->assertDatabaseHas('game_player_seat', [
            'game_id'     => $game->id,
            'player_id'   => $playerB->id,
            'seat_number' => 1,
        ]);
    }

    /**
     * Verify that the game summary in the response reflects the swapped seats.
     *
     * @return void The swap endpoint returns the updated game summary via the API envelope.
     * Logic: confirm that after a swap, the summary teams payload contains both players
     * with their new seat assignments so the client can reconcile state without a refetch.
     */
    public function test_swap_response_contains_updated_game_summary(): void
    {
        $game    = $this->makeGame();
        $team    = $this->makeTeam($game);
        $playerA = $this->makePlayer($team, 'Alice', $game->id, 1);
        $playerB = $this->makePlayer($team, 'Bob',   $game->id, 3);

        $response = $this->putJson("/api/v1/games/{$game->id}/players/swap-seats", [
            'player_id_a' => $playerA->id,
            'player_id_b' => $playerB->id,
        ]);

        $players = collect($response->json('data.game.teams.0.players'));

        $this->assertEquals(3, $players->firstWhere('display_name', 'Alice')['seat_number']);
        $this->assertEquals(1, $players->firstWhere('display_name', 'Bob')['seat_number']);
    }

    /**
     * Verify that players from different teams in the same game can have their seats swapped.
     *
     * @return void Seats across teams are exchangeable.
     * Logic: seat numbers are game-scoped and team-agnostic, so swapping cross-team seats
     * is valid; the endpoint should succeed and persist the exchange.
     */
    public function test_can_swap_seats_between_players_in_different_teams(): void
    {
        $game    = $this->makeGame();
        $teamA   = $this->makeTeam($game, 'Team Alpha');
        $teamB   = $this->makeTeam($game, 'Team Beta');
        $playerA = $this->makePlayer($teamA, 'Alice', $game->id, 1);
        $playerB = $this->makePlayer($teamB, 'Bob',   $game->id, 2);

        $response = $this->putJson("/api/v1/games/{$game->id}/players/swap-seats", [
            'player_id_a' => $playerA->id,
            'player_id_b' => $playerB->id,
        ]);

        $response->assertStatus(200);

        $this->assertDatabaseHas('game_player_seat', ['game_id' => $game->id, 'player_id' => $playerA->id, 'seat_number' => 2]);
        $this->assertDatabaseHas('game_player_seat', ['game_id' => $game->id, 'player_id' => $playerB->id, 'seat_number' => 1]);
    }

    // -------------------------------------------------------------------------
    // Validation rejection tests
    // -------------------------------------------------------------------------

    /**
     * Verify that the endpoint rejects requests that omit player_id_a.
     *
     * @return void Missing player_id_a returns 422.
     * Logic: player_id_a is required; the form request must reject the payload with errors.
     */
    public function test_rejects_request_missing_player_id_a(): void
    {
        $game = $this->makeGame();

        $this->putJson("/api/v1/games/{$game->id}/players/swap-seats", [
            'player_id_b' => 1,
        ])->assertStatus(422)->assertJsonStructure(['data' => ['errors' => ['player_id_a']]]);
    }

    /**
     * Verify that the endpoint rejects requests that omit player_id_b.
     *
     * @return void Missing player_id_b returns 422.
     * Logic: player_id_b is required; the form request must reject the payload with errors.
     */
    public function test_rejects_request_missing_player_id_b(): void
    {
        $game = $this->makeGame();

        $this->putJson("/api/v1/games/{$game->id}/players/swap-seats", [
            'player_id_a' => 1,
        ])->assertStatus(422)->assertJsonStructure(['data' => ['errors' => ['player_id_b']]]);
    }

    /**
     * Verify that the endpoint rejects requests where both player ids are the same.
     *
     * @return void Identical player ids return 422 with a "different" validation error.
     * Logic: swapping a player with themselves is a no-op that the form request rejects
     * using the `different` rule to preserve data integrity.
     */
    public function test_rejects_request_when_both_player_ids_are_identical(): void
    {
        $game = $this->makeGame();

        $this->putJson("/api/v1/games/{$game->id}/players/swap-seats", [
            'player_id_a' => 5,
            'player_id_b' => 5,
        ])->assertStatus(422)->assertJsonStructure(['data' => ['errors' => ['player_id_b']]]);
    }

    // -------------------------------------------------------------------------
    // Business rule tests
    // -------------------------------------------------------------------------

    /**
     * Verify that the endpoint rejects seat swaps on a finished game.
     *
     * @return void A finished game returns 422 with a game validation error.
     * Logic: the service enforces in-progress status; swapping seats after the game ends is blocked.
     */
    public function test_rejects_swap_for_finished_game(): void
    {
        $game    = $this->makeGame('finished');
        $team    = $this->makeTeam($game);
        $playerA = $this->makePlayer($team, 'Alice', $game->id, 1);
        $playerB = $this->makePlayer($team, 'Bob',   $game->id, 3);

        $this->putJson("/api/v1/games/{$game->id}/players/swap-seats", [
            'player_id_a' => $playerA->id,
            'player_id_b' => $playerB->id,
        ])->assertStatus(422)->assertJsonPath('data.errors.game.0', 'Cannot swap seats in a finished game.');
    }

    /**
     * Verify that the endpoint returns 404 when the game does not exist.
     *
     * @return void An unknown game id returns 404.
     * Logic: findGameOrFail in the service throws a model-not-found exception which resolves to 404.
     */
    public function test_returns_404_for_unknown_game(): void
    {
        $this->putJson('/api/v1/games/9999/players/swap-seats', [
            'player_id_a' => 1,
            'player_id_b' => 2,
        ])->assertStatus(404);
    }
}
