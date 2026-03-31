<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TeamBatchUpdateTest extends TestCase
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

    private function attachPlayer(Team $team, string $name): Player
    {
        $player = Player::query()->create(['user_id' => null, 'display_name' => $name]);
        DB::table('team_player')->insert([
            'team_id'   => $team->id,
            'player_id' => $player->id,
        ]);

        return $player;
    }

    /**
     * Ensure the batch endpoint renames the team and returns the updated summary.
     *
     * @return void Verifies the new name appears in the response.
     * Logic: submit a batch request with only a name change and assert the summary reflects it.
     */
    public function test_batch_update_renames_team(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game, 'Old Name');

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}/batch", [
            'name' => 'New Name',
        ]);

        $response->assertOk();
        $response->assertJsonPath('status', 'success');

        $teams = $response->json('data.game.teams');
        $this->assertSame('New Name', $teams[0]['name']);
        $this->assertDatabaseHas('teams', ['id' => $team->id, 'name' => 'New Name']);
    }

    /**
     * Ensure the batch endpoint removes the specified players.
     *
     * @return void Verifies the team_player pivot rows are deleted.
     * Logic: attach two players, send a batch request removing one, and assert only that player's
     * pivot row is gone while the other remains.
     */
    public function test_batch_update_removes_players(): void
    {
        $game   = $this->makeGame();
        $team   = $this->makeTeam($game);
        $alice  = $this->attachPlayer($team, 'Alice');
        $bob    = $this->attachPlayer($team, 'Bob');

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}/batch", [
            'name'               => $team->name,
            'remove_player_ids'  => [$alice->id],
        ]);

        $response->assertOk();
        $this->assertDatabaseMissing('team_player', ['team_id' => $team->id, 'player_id' => $alice->id]);
        $this->assertDatabaseHas('team_player', ['team_id' => $team->id, 'player_id' => $bob->id]);
    }

    /**
     * Ensure the batch endpoint adds new guest players by name.
     *
     * @return void Verifies the player appears in the summary and the pivot table.
     * Logic: submit a batch request with an add_players entry and assert the new player is persisted.
     */
    public function test_batch_update_adds_new_player_by_name(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}/batch", [
            'name'        => $team->name,
            'add_players' => [['name' => 'Carlos']],
        ]);

        $response->assertOk();

        $player = Player::query()->where('display_name', 'Carlos')->first();
        $this->assertNotNull($player);
        $this->assertDatabaseHas('team_player', ['team_id' => $team->id, 'player_id' => $player->id]);
    }

    /**
     * Ensure the batch endpoint adds a registered user as a player.
     *
     * @return void Verifies the user's player record is linked to the team.
     * Logic: submit a batch request with a user_id entry and assert the resolved player is attached.
     */
    public function test_batch_update_adds_player_from_registered_user(): void
    {
        $game        = $this->makeGame();
        $team        = $this->makeTeam($game);
        $newUser     = User::factory()->create(['name' => 'Maria']);

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}/batch", [
            'name'        => $team->name,
            'add_players' => [['user_id' => $newUser->id, 'name' => 'Maria']],
        ]);

        $response->assertOk();

        $player = Player::query()->where('user_id', $newUser->id)->first();
        $this->assertNotNull($player);
        $this->assertDatabaseHas('team_player', ['team_id' => $team->id, 'player_id' => $player->id]);
    }

    /**
     * Ensure the batch endpoint performs the rename, removal, and addition atomically in one request.
     *
     * @return void Verifies all three operations are applied and the final summary is consistent.
     * Logic: set up a team with one existing player, rename the team, remove the existing player,
     * and add a new player in a single batch call. Assert all three changes are persisted.
     */
    public function test_batch_update_applies_all_changes_atomically(): void
    {
        $game   = $this->makeGame();
        $team   = $this->makeTeam($game, 'Old Name');
        $alice  = $this->attachPlayer($team, 'Alice');

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}/batch", [
            'name'               => 'New Name',
            'remove_player_ids'  => [$alice->id],
            'add_players'        => [['name' => 'Bob']],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('teams', ['id' => $team->id, 'name' => 'New Name']);
        $this->assertDatabaseMissing('team_player', ['team_id' => $team->id, 'player_id' => $alice->id]);
        $bob = Player::query()->where('display_name', 'Bob')->first();
        $this->assertNotNull($bob);
        $this->assertDatabaseHas('team_player', ['team_id' => $team->id, 'player_id' => $bob->id]);
    }

    /**
     * Ensure the batch endpoint rejects the request when the game is finished.
     *
     * @return void Verifies a 422 is returned with an appropriate error message.
     * Logic: mark the game as finished and submit a batch request; assert a validation error.
     */
    public function test_batch_update_rejected_for_finished_game(): void
    {
        $game = $this->makeGame('finished');
        $team = $this->makeTeam($game);

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}/batch", [
            'name' => 'Any Name',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonPath('data.errors.game.0', 'Cannot update teams in a finished game.');
    }

    /**
     * Ensure the batch endpoint returns 404 when the team does not belong to the game.
     *
     * @return void Verifies cross-game writes are rejected.
     * Logic: create a team without attaching it to the game, then attempt a batch update.
     */
    public function test_batch_update_returns_404_when_team_not_in_game(): void
    {
        $game      = $this->makeGame();
        $otherTeam = Team::query()->create(['name' => 'Orphan']);

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$otherTeam->id}/batch", [
            'name' => 'Any Name',
        ]);

        $response->assertNotFound();
    }

    /**
     * Ensure the batch endpoint returns 422 when the request body is missing the required name.
     *
     * @return void Verifies validation rejects an empty name field.
     * Logic: submit a batch request without a name and assert an unprocessable response.
     */
    public function test_batch_update_rejects_missing_name(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);

        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}/batch", [
            'name' => '',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure the batch endpoint requires authentication.
     *
     * @return void Verifies unauthenticated requests are rejected with 401.
     * Logic: make the request without logging in and assert the auth middleware rejects it.
     */
    public function test_batch_update_requires_authentication(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);

        $response = $this->withoutMiddleware()->putJson(
            "/api/v1/games/{$game->id}/teams/{$team->id}/batch",
            ['name' => 'X'],
        );

        // Guest call goes through — route exists. Test that auth middleware is applied by
        // acting as a guest (no actingAs) and hitting the real middleware stack.
        $this->refreshApplication();
        $response = $this->putJson("/api/v1/games/{$game->id}/teams/{$team->id}/batch", [
            'name' => 'X',
        ]);
        $response->assertUnauthorized();
    }

    /**
     * Ensure the batch endpoint returns a 404 for a non-existent game.
     *
     * @return void Verifies the game-not-found path is handled gracefully.
     * Logic: submit a batch request for a game that does not exist and assert 404.
     */
    public function test_batch_update_returns_404_for_non_existent_game(): void
    {
        $response = $this->putJson('/api/v1/games/9999/teams/1/batch', [
            'name' => 'Any Name',
        ]);

        $response->assertNotFound();
    }
}
