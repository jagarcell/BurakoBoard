<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Team;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TeamStoreTest extends TestCase
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

    private function makeTeam(Game $game, string $name): Team
    {
        return Team::query()->create([
            'game_id'       => $game->id,
            'name'          => $name,
            'current_score' => 0,
        ]);
    }

    /**
     * Ensure a team can be created with a valid name.
     *
     * @return void Verifies the store endpoint creates a team and returns the game summary.
     * Logic: post a valid team name to the store endpoint and assert a 201 with the team present in the summary.
     */
    public function test_can_create_a_team(): void
    {
        $game = $this->makeGame();

        $response = $this->postJson("/api/v1/games/{$game->id}/teams", [
            'name' => 'Team Alpha',
        ]);

        $response
            ->assertStatus(201)
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.teams.0.name', 'Team Alpha');
    }

    /**
     * Ensure creating a team with an empty name is rejected.
     *
     * @return void Verifies that an empty team name returns a 422 validation error.
     * Logic: post with an empty name and assert an unprocessable response.
     */
    public function test_team_store_rejects_empty_name(): void
    {
        $game = $this->makeGame();

        $response = $this->postJson("/api/v1/games/{$game->id}/teams", [
            'name' => '',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure a duplicate team name within the same game is rejected on store.
     *
     * @return void Verifies per-game name uniqueness on create.
     * Logic: add a team named 'Team Alpha', then attempt to add another with the same name and assert 422.
     */
    public function test_team_store_rejects_duplicate_name_within_same_game(): void
    {
        $game = $this->makeGame();
        $this->makeTeam($game, 'Team Alpha');

        $response = $this->postJson("/api/v1/games/{$game->id}/teams", [
            'name' => 'Team Alpha',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure a team name that duplicates a team in a different game is allowed.
     *
     * @return void Verifies uniqueness is scoped to the game, not global.
     * Logic: create a team named 'Team Alpha' in game A, then create 'Team Alpha' in game B and assert 201.
     */
    public function test_team_store_allows_same_name_in_different_game(): void
    {
        $gameA = $this->makeGame();
        $gameB = $this->makeGame();
        $this->makeTeam($gameA, 'Team Alpha');

        $response = $this->postJson("/api/v1/games/{$gameB->id}/teams", [
            'name' => 'Team Alpha',
        ]);

        $response->assertStatus(201);
    }

    /**
     * Ensure the team name is normalised before the uniqueness check on store.
     *
     * @return void Verifies that '  Team  Alpha  ' is treated as 'Team Alpha' for uniqueness.
     * Logic: create 'Team Alpha', attempt to create '  Team  Alpha  ', and assert 422.
     */
    public function test_team_store_normalises_name_before_uniqueness_check(): void
    {
        $game = $this->makeGame();
        $this->makeTeam($game, 'Team Alpha');

        $response = $this->postJson("/api/v1/games/{$game->id}/teams", [
            'name' => '  Team  Alpha  ',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure the stored team name contains the normalised form of the submitted value.
     *
     * @return void Verifies that leading/trailing spaces and duplicate inner spaces are removed before persistence.
     * Logic: post '  Team   Alpha  ' and assert the returned team name is 'Team Alpha'.
     */
    public function test_team_store_persists_normalised_name(): void
    {
        $game = $this->makeGame();

        $response = $this->postJson("/api/v1/games/{$game->id}/teams", [
            'name' => '  Team   Alpha  ',
        ]);

        $response
            ->assertStatus(201)
            ->assertJsonPath('data.game.teams.0.name', 'Team Alpha');
    }

    /**
     * Ensure creating a team in a finished game is rejected.
     *
     * @return void Verifies that teams cannot be added to finished games.
     * Logic: finish a game, attempt to add a team, and assert 422.
     */
    public function test_team_store_rejected_for_finished_game(): void
    {
        $game = $this->makeGame('finished');

        $response = $this->postJson("/api/v1/games/{$game->id}/teams", [
            'name' => 'Late Team',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure creating a team whose name differs only in casing is rejected.
     *
     * @return void Verifies that the uniqueness check is case-insensitive.
     * Logic: create 'Team Alpha', attempt to create 'TEAM ALPHA', and assert 422.
     */
    public function test_team_store_rejects_duplicate_name_case_insensitively(): void
    {
        $game = $this->makeGame();
        $this->makeTeam($game, 'Team Alpha');

        $response = $this->postJson("/api/v1/games/{$game->id}/teams", [
            'name' => 'TEAM ALPHA',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure the stored team name preserves the original casing supplied by the caller.
     *
     * @return void Verifies the name is not lowercased before persistence.
     * Logic: post 'Team Alpha' and assert the returned team name is exactly 'Team Alpha'.
     */
    public function test_team_store_preserves_original_casing(): void
    {
        $game = $this->makeGame();

        $response = $this->postJson("/api/v1/games/{$game->id}/teams", [
            'name' => 'Team Alpha',
        ]);

        $response
            ->assertStatus(201)
            ->assertJsonPath('data.game.teams.0.name', 'Team Alpha');
    }
}
