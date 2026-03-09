<?php

namespace Tests\Unit\Models;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelRelationshipTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Ensure a game loads the teams that belong to it.
     *
     * @return void Verifies the has-many game to teams relationship.
     * Logic: create teams under one game and assert only those related records are returned from the game model.
     */
    public function test_game_has_many_teams(): void
    {
        $game = Game::query()->create([
            'name' => 'League Night',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        Team::query()->create([
            'game_id' => $game->id,
            'name' => 'North',
            'current_score' => 0,
        ]);

        Team::query()->create([
            'game_id' => $game->id,
            'name' => 'South',
            'current_score' => 0,
        ]);

        $loadedGame = Game::query()->with('teams')->findOrFail($game->id);

        $this->assertCount(2, $loadedGame->teams);
        $this->assertSame(['North', 'South'], $loadedGame->teams->pluck('name')->all());
    }

    /**
     * Ensure a team resolves its parent game.
     *
     * @return void Verifies the inverse belongs-to team to game relationship.
     * Logic: create a team with a game_id and assert the related game can be loaded from the team model.
     */
    public function test_team_belongs_to_game(): void
    {
        $game = Game::query()->create([
            'name' => 'Saturday Match',
            'target_points' => 1500,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $team = Team::query()->create([
            'game_id' => $game->id,
            'name' => 'East',
            'current_score' => 0,
        ]);

        $this->assertSame($game->id, $team->game->id);
        $this->assertSame('Saturday Match', $team->game->name);
    }

    /**
     * Ensure a team loads players and those players resolve registered users.
     *
     * @return void Verifies team membership uses the player pivot and optional user ownership.
     * Logic: attach a player linked to a user onto a team and assert the team and player relations both resolve correctly.
     */
    public function test_team_membership_flows_through_players_to_users(): void
    {
        $user = User::factory()->create();

        $game = Game::query()->create([
            'name' => 'Club Finals',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $team = Team::query()->create([
            'game_id' => $game->id,
            'name' => 'West',
            'current_score' => 0,
        ]);

        $player = Player::query()->create([
            'user_id' => $user->id,
            'display_name' => $user->name,
        ]);

        $team->players()->attach($player->id);

        $loadedTeam = Team::query()->with('players.user')->findOrFail($team->id);
        $loadedPlayer = Player::query()->with(['teams', 'user'])->findOrFail($player->id);
        $loadedUser = User::query()->with('player')->findOrFail($user->id);

        $this->assertCount(1, $loadedTeam->players);
        $this->assertSame($player->id, $loadedTeam->players->first()->id);
        $this->assertSame($user->id, $loadedTeam->players->first()->user->id);
        $this->assertSame($team->id, $loadedPlayer->teams->first()->id);
        $this->assertSame($user->id, $loadedPlayer->user->id);
        $this->assertSame($player->id, $loadedUser->player->id);
    }
}
