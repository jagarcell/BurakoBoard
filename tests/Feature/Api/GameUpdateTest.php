<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameUpdateTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    /**
     * Boot a shared authenticated user for each test.
     *
     * @return void
     * Logic: authenticate once per test so all requests pass the auth:sanctum middleware.
     */
    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->actingAs($this->user);
    }

    /**
     * Ensure a game's name and target points can be updated.
     *
     * @return void Verifies the update endpoint persists new values and returns them.
     */
    public function test_can_update_a_game_name_and_target_points(): void
    {
        $game = Game::query()->create([
            'name' => 'Original Name',
            'target_points' => 1500,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 2,
        ]);

        $response = $this->putJson("/api/v1/games/{$game->id}", [
            'name' => 'Updated Name',
            'target_points' => 3000,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.name', 'Updated Name')
            ->assertJsonPath('data.game.target_points', 3000)
            ->assertJsonPath('data.game.id', $game->id);

        $this->assertDatabaseHas('games', [
            'id' => $game->id,
            'name' => 'Updated Name',
            'target_points' => 3000,
        ]);
    }

    /**
     * Ensure non-game fields are not altered by the update.
     *
     * @return void Verifies status and scoring fields remain unchanged after update.
     */
    public function test_update_does_not_alter_status_or_round_counter(): void
    {
        $game = Game::query()->create([
            'name' => 'Stable Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 5,
        ]);

        $this->putJson("/api/v1/games/{$game->id}", [
            'name' => 'Stable Game Renamed',
            'target_points' => 2000,
        ])->assertOk();

        $this->assertDatabaseHas('games', [
            'id' => $game->id,
            'status' => 'in_progress',
            'current_round_number' => 5,
        ]);
    }

    /**
     * Ensure updating a non-existent game returns a 404.
     *
     * @return void Verifies the endpoint returns not-found for missing game ids.
     */
    public function test_update_returns_404_for_missing_game(): void
    {
        $this->putJson('/api/v1/games/99999', [
            'name' => 'Ghost Game',
            'target_points' => 1000,
        ])->assertNotFound();
    }

    /**
     * Ensure sending an empty name fails validation.
     *
     * @return void Verifies the name field is required.
     */
    public function test_update_requires_a_name(): void
    {
        $game = Game::query()->create([
            'name' => 'Old Name',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $this->putJson("/api/v1/games/{$game->id}", [
            'name' => '',
            'target_points' => 2000,
        ])->assertUnprocessable();
    }

    /**
     * Ensure sending a non-positive target_points value fails validation.
     *
     * @return void Verifies the target_points field must be at least 1.
     */
    public function test_update_requires_positive_target_points(): void
    {
        $game = Game::query()->create([
            'name' => 'Valid Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $this->putJson("/api/v1/games/{$game->id}", [
            'name' => 'Valid Game',
            'target_points' => 0,
        ])->assertUnprocessable();
    }
}
