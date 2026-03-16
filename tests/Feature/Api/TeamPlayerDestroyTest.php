<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TeamPlayerDestroyTest extends TestCase
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
        $team = Team::query()->create(['name' => $name]);
        DB::table('game_team')->insert([
            'game_id'       => $game->id,
            'team_id'       => $team->id,
            'current_score' => 0,
        ]);

        return $team;
    }

    private function attachPlayerByName(Team $team, string $name): Player
    {
        $player = Player::query()->create(['user_id' => null, 'display_name' => $name]);
        $team->players()->attach($player->id);

        return $player;
    }

    /**
     * Ensure a player can be removed from a team.
     *
     * @return void Verifies that the player no longer appears in the game summary after deletion.
     * Logic: attach a player to a team, call the delete endpoint, and assert the player is absent from the summary.
     */
    public function test_can_remove_a_player_from_a_team(): void
    {
        $game   = $this->makeGame();
        $team   = $this->makeTeam($game);
        $player = $this->attachPlayerByName($team, 'Carlos');

        $response = $this->deleteJson(
            "/api/v1/games/{$game->id}/teams/{$team->id}/players/{$player->id}"
        );

        $response->assertStatus(200);

        $teams = $response->json('data.game.teams');
        $players = collect($teams[0]['players'] ?? []);

        $this->assertFalse(
            $players->contains('id', $player->id),
            'Removed player should not appear in the summary.'
        );
    }

    /**
     * Ensure the team_player row is physically deleted from the database.
     *
     * @return void Verifies the pivot row no longer exists after removal.
     * Logic: attach a player, delete via endpoint, and assert the pivot table has no corresponding row.
     */
    public function test_player_pivot_row_is_deleted_from_database(): void
    {
        $game   = $this->makeGame();
        $team   = $this->makeTeam($game);
        $player = $this->attachPlayerByName($team, 'Roberto');

        $this->deleteJson(
            "/api/v1/games/{$game->id}/teams/{$team->id}/players/{$player->id}"
        )->assertStatus(200);

        $this->assertDatabaseMissing('team_player', [
            'team_id'   => $team->id,
            'player_id' => $player->id,
        ]);
    }

    /**
     * Ensure removing a player from a finished game is rejected.
     *
     * @return void Verifies a 422 is returned when the game status is finished.
     * Logic: mark the game as finished, attempt to delete a player, and assert validation failure.
     */
    public function test_cannot_remove_player_from_finished_game(): void
    {
        $game   = $this->makeGame('finished');
        $team   = $this->makeTeam($game);
        $player = $this->attachPlayerByName($team, 'Carlos');

        $response = $this->deleteJson(
            "/api/v1/games/{$game->id}/teams/{$team->id}/players/{$player->id}"
        );

        $response->assertStatus(422);
        $response->assertJsonPath('data.errors.game.0', 'Cannot remove players from a finished game.');
    }

    /**
     * Ensure that deleting a non-existent game returns 404.
     *
     * @return void Verifies the endpoint gracefully handles missing game references.
     * Logic: call the delete endpoint with a game id that does not exist and assert 404.
     */
    public function test_returns_404_for_non_existent_game(): void
    {
        $response = $this->deleteJson('/api/v1/games/9999/teams/1/players/1');

        $response->assertStatus(404);
    }

    /**
     * Ensure that deleting a player from a team not belonging to the game returns 404.
     *
     * @return void Verifies team-game ownership is validated before removal.
     * Logic: create a team not linked to the given game, attempt to delete a player, and assert 404.
     */
    public function test_returns_404_when_team_does_not_belong_to_game(): void
    {
        $game       = $this->makeGame();
        $otherTeam  = Team::query()->create(['name' => 'Orphan Team']);
        $player     = Player::query()->create(['user_id' => null, 'display_name' => 'Ghost']);
        $otherTeam->players()->attach($player->id);

        $response = $this->deleteJson(
            "/api/v1/games/{$game->id}/teams/{$otherTeam->id}/players/{$player->id}"
        );

        $response->assertStatus(404);
    }

    /**
     * Ensure removing one player does not affect other players on the same team.
     *
     * @return void Verifies only the targeted player is removed from the roster.
     * Logic: attach two players, remove one, and assert the other still appears in the summary.
     */
    public function test_removing_one_player_leaves_other_players_intact(): void
    {
        $game    = $this->makeGame();
        $team    = $this->makeTeam($game);
        $carlos  = $this->attachPlayerByName($team, 'Carlos');
        $roberto = $this->attachPlayerByName($team, 'Roberto');

        $this->deleteJson(
            "/api/v1/games/{$game->id}/teams/{$team->id}/players/{$carlos->id}"
        )->assertStatus(200);

        $this->assertDatabaseMissing('team_player', [
            'team_id'   => $team->id,
            'player_id' => $carlos->id,
        ]);

        $this->assertDatabaseHas('team_player', [
            'team_id'   => $team->id,
            'player_id' => $roberto->id,
        ]);
    }
}
