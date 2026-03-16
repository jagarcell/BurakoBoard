<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Team;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GameHasTwoTeamsTest extends TestCase
{
    use RefreshDatabase;

    private function makeGame(): Game
    {
        return Game::query()->create([
            'name'                 => 'Test Game',
            'target_points'        => 2000,
            'status'               => 'in_progress',
            'winning_team_id'      => null,
            'current_round_number' => 0,
        ]);
    }

    private function addTeam(Game $game, string $name): Team
    {
        $team = Team::query()->create(['name' => $name]);
        DB::table('game_team')->insert([
            'game_id'       => $game->id,
            'team_id'       => $team->id,
            'current_score' => 0,
        ]);

        return $team;
    }

    /**
     * Ensure the endpoint returns false when a game has no teams.
     *
     * @return void Verifies the has_two_teams flag is false for a fresh game.
     * Logic: create a game without any teams and assert the endpoint responds with has_two_teams = false.
     */
    public function test_returns_false_when_game_has_no_teams(): void
    {
        $game = $this->makeGame();

        $this->getJson("/api/v1/games/{$game->id}/has-two-teams")
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.has_two_teams', false);
    }

    /**
     * Ensure the endpoint returns false when a game has only one team.
     *
     * @return void Verifies the has_two_teams flag is false with a single team.
     * Logic: create a game with one team and assert the endpoint responds with has_two_teams = false.
     */
    public function test_returns_false_when_game_has_one_team(): void
    {
        $game = $this->makeGame();
        $this->addTeam($game, 'Team Alpha');

        $this->getJson("/api/v1/games/{$game->id}/has-two-teams")
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.has_two_teams', false);
    }

    /**
     * Ensure the endpoint returns true when a game has exactly two teams.
     *
     * @return void Verifies the has_two_teams flag is true with two teams.
     * Logic: create a game with two teams and assert the endpoint responds with has_two_teams = true.
     */
    public function test_returns_true_when_game_has_two_teams(): void
    {
        $game = $this->makeGame();
        $this->addTeam($game, 'Team Alpha');
        $this->addTeam($game, 'Team Beta');

        $this->getJson("/api/v1/games/{$game->id}/has-two-teams")
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.has_two_teams', true);
    }

    /**
     * Ensure the endpoint returns a 404 for a non-existent game.
     *
     * @return void Verifies that requesting a missing game results in a 404.
     * Logic: call the endpoint with an id that has no matching game row and assert the not-found response.
     */
    public function test_returns_404_for_missing_game(): void
    {
        $this->getJson('/api/v1/games/99999/has-two-teams')
            ->assertNotFound();
    }
}
