<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Team;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TeamUpdateTest extends TestCase
{
    use RefreshDatabase;

    private function makeGame(string $status = 'in_progress'): Game
    {
        return Game::query()->create([
            'name'                => 'Test Game',
            'target_points'       => 2000,
            'status'              => $status,
            'winning_team_id'     => null,
            'current_round_number'=> 0,
        ]);
    }

    private function makeTeam(Game $game, string $name = 'Team Alpha'): Team
    {
        return Team::query()->create([
            'game_id'       => $game->id,
            'name'          => $name,
            'current_score' => 0,
        ]);
    }

    /**
     * Ensure updating a team name returns the updated game summary.
     *
     * @return void Verifies the updated team name appears in the response.
     * Logic: create a game and team, call the update endpoint with a new name, and assert the name is reflected in the game summary.
     */
    public function test_team_update_changes_team_name(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}", [
            'name' => 'Renamed Alpha',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.teams.0.name', 'Renamed Alpha');
    }

    /**
     * Ensure updating a team with an empty name returns a validation error.
     *
     * @return void Verifies that an empty team name is rejected with a 422 response.
     * Logic: submit a PUT request with no name and assert validation failure is returned.
     */
    public function test_team_update_rejects_empty_name(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}", [
            'name' => '',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure updating a team on a finished game returns a validation error.
     *
     * @return void Verifies that teams in finished games cannot be renamed.
     * Logic: finish a game, attempt to rename its team, and assert a 422 is returned.
     */
    public function test_team_update_rejected_for_finished_game(): void
    {
        $game = $this->makeGame('finished');
        $team = $this->makeTeam($game);

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}", [
            'name' => 'New Name',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure updating a team that does not belong to the given game returns 404.
     *
     * @return void Verifies cross-game team updates are blocked.
     * Logic: create two games with their own teams, attempt to update game A's team via game B's URL, and assert 404.
     */
    public function test_team_update_returns_404_for_team_in_different_game(): void
    {
        $gameA = $this->makeGame();
        $gameB = $this->makeGame();
        $teamA = $this->makeTeam($gameA, 'Team A');

        $response = $this->putJson("/api/v1/games/{$gameB->id}/teams/{$teamA->id}", [
            'name' => 'Stolen',
        ]);

        $response->assertNotFound();
    }
}
