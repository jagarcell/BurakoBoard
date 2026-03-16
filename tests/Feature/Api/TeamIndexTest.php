<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TeamIndexTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Ensure the teams index returns an empty list when no teams exist.
     *
     * @return void Verifies the endpoint returns an empty array for a fresh database.
     * Logic: call the endpoint with no teams seeded and assert the data array is empty.
     */
    public function test_teams_index_returns_empty_list_when_no_teams_exist(): void
    {
        $response = $this->getJson('/api/v1/teams');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(0, 'data.teams');
    }

    /**
     * Ensure the teams index returns all teams across games ordered newest first.
     *
     * @return void Verifies team list payload and ordering.
     * Logic: create multiple teams in different games, call the endpoint, and assert they are returned from newest to oldest with id and name exposed.
     */
    public function test_teams_index_returns_all_teams_ordered_by_newest_first(): void
    {
        $gameA = Game::query()->create(['name' => 'Game A', 'target_points' => 2000, 'status' => 'in_progress', 'winning_team_id' => null, 'current_round_number' => 0]);
        $gameB = Game::query()->create(['name' => 'Game B', 'target_points' => 2000, 'status' => 'in_progress', 'winning_team_id' => null, 'current_round_number' => 0]);

        $teamA = Team::query()->create(['name' => 'Alpha']);
        DB::table('game_team')->insert(['game_id' => $gameA->id, 'team_id' => $teamA->id, 'current_score' => 0]);
        $teamB = Team::query()->create(['name' => 'Beta']);
        DB::table('game_team')->insert(['game_id' => $gameB->id, 'team_id' => $teamB->id, 'current_score' => 0]);

        $response = $this->getJson('/api/v1/teams');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(2, 'data.teams')
            ->assertJsonPath('data.teams.0.name', 'Beta')
            ->assertJsonPath('data.teams.1.name', 'Alpha');
    }

    /**
     * Ensure the teams index includes players within each team.
     *
     * @return void Verifies that player data is embedded in the team list payload.
     * Logic: create a team with a player, call the endpoint, and assert the player fields are returned inside the team's players array.
     */
    public function test_teams_index_includes_players_for_each_team(): void
    {
        $user = User::factory()->create(['name' => 'Alice']);

        $game = Game::query()->create(['name' => 'Test Game', 'target_points' => 2000, 'status' => 'in_progress', 'winning_team_id' => null, 'current_round_number' => 0]);
        $team = Team::query()->create(['name' => 'Team Alpha']);
        DB::table('game_team')->insert(['game_id' => $game->id, 'team_id' => $team->id, 'current_score' => 0]);

        $player = Player::query()->create(['user_id' => $user->id, 'display_name' => 'Alice']);
        $team->players()->attach($player->id);

        $response = $this->getJson('/api/v1/teams');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(1, 'data.teams')
            ->assertJsonPath('data.teams.0.name', 'Team Alpha')
            ->assertJsonCount(1, 'data.teams.0.players')
            ->assertJsonPath('data.teams.0.players.0.display_name', 'Alice')
            ->assertJsonPath('data.teams.0.players.0.user_id', $user->id);
    }
}
