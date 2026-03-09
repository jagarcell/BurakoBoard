<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameIndexTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Ensure the games index returns existing games for dashboard selection.
     *
     * @return void Verifies the lightweight game list payload and ordering.
     * Logic: create multiple games, call the index endpoint, and assert the dashboard receives selector-friendly game data in newest-first order.
     */
    public function test_games_index_returns_existing_games_for_dashboard_selection(): void
    {
        Game::query()->create([
            'name' => 'Opening Table',
            'target_points' => 1500,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        Game::query()->create([
            'name' => 'Championship Table',
            'target_points' => 3000,
            'status' => 'finished',
            'winning_team_id' => null,
            'current_round_number' => 5,
        ]);

        $response = $this->getJson('/api/v1/games');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(2, 'data.games')
            ->assertJsonPath('data.games.0.name', 'Championship Table')
            ->assertJsonPath('data.games.0.target_points', 3000)
            ->assertJsonPath('data.games.1.name', 'Opening Table');
    }
}
