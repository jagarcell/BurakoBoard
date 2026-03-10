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

    /**
     * Ensure renaming a team to a name already taken within the same game is rejected.
     *
     * @return void Verifies per-game name uniqueness on update.
     * Logic: create two teams in the same game, attempt to rename Team B to Team A's name, and assert 422.
     */
    public function test_team_update_rejects_duplicate_name_within_same_game(): void
    {
        $game  = $this->makeGame();
        $this->makeTeam($game, 'Team Alpha');
        $teamB = $this->makeTeam($game, 'Team Beta');

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$teamB->id}", [
            'name' => 'Team Alpha',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure a team can be renamed to its own current name without a uniqueness error.
     *
     * @return void Verifies that the current team is excluded from the uniqueness check.
     * Logic: submit a PUT request with the same name the team already has and assert 200.
     */
    public function test_team_update_allows_same_name_as_current(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game, 'Team Alpha');

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}", [
            'name' => 'Team Alpha',
        ]);

        $response->assertOk();
    }

    /**
     * Ensure the team name is normalised before uniqueness is checked on update.
     *
     * @return void Verifies leading/trailing spaces and duplicate inner spaces are collapsed.
     * Logic: create a team named 'Team Alpha', attempt to rename another team to '  Team  Alpha  ',
     * and assert 422 because the normalised value matches the existing name.
     */
    public function test_team_update_normalises_name_before_uniqueness_check(): void
    {
        $game  = $this->makeGame();
        $this->makeTeam($game, 'Team Alpha');
        $teamB = $this->makeTeam($game, 'Team Beta');

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$teamB->id}", [
            'name' => '  Team  Alpha  ',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure the stored name contains the normalised form of the submitted name on update.
     *
     * @return void Verifies that the persisted name has trimmed and collapsed whitespace.
     * Logic: submit a PUT with extra spaces and assert the returned team name is normalised.
     */
    public function test_team_update_stores_normalised_name(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game, 'Team Alpha');

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}", [
            'name' => '  Team   Bravo  ',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.game.teams.0.name', 'Team Bravo');
    }

    /**
     * Ensure renaming a team to a name that differs only in casing from an existing team is rejected.
     *
     * @return void Verifies that the uniqueness check on update is case-insensitive.
     * Logic: create 'Team Alpha' and 'Team Beta', attempt to rename Beta to 'TEAM ALPHA', and assert 422.
     */
    public function test_team_update_rejects_duplicate_name_case_insensitively(): void
    {
        $game  = $this->makeGame();
        $this->makeTeam($game, 'Team Alpha');
        $teamB = $this->makeTeam($game, 'Team Beta');

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$teamB->id}", [
            'name' => 'TEAM ALPHA',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure a team can be renamed using different casing from its current name.
     *
     * @return void Verifies that re-casing a team's own name (e.g. 'team alpha' → 'Team Alpha') is allowed.
     * Logic: create 'team alpha', rename it to 'Team Alpha', and assert 200 with the new casing stored.
     */
    public function test_team_update_allows_recasing_own_name(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game, 'team alpha');

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}", [
            'name' => 'Team Alpha',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.game.teams.0.name', 'Team Alpha');
    }
}
