<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TeamPlayerStoreTest extends TestCase
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
     * Ensure a player can be added to a team with a free-form name.
     *
     * @return void Verifies successful player assignment returns a 201 with the player in the summary.
     * Logic: post a name-only payload to the add-player endpoint and assert the name appears in the game summary.
     */
    public function test_can_add_a_named_player_to_a_team(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/players", [
            'name' => 'Carlos',
        ]);

        $response
            ->assertStatus(201)
            ->assertJsonPath('data.game.teams.0.players.0.display_name', 'Carlos');
    }

    /**
     * Ensure that adding a player whose name already exists in the team is rejected.
     *
     * @return void Verifies per-team player name uniqueness on store.
     * Logic: add 'Carlos' to a team, attempt to add 'Carlos' again, and assert 422.
     */
    public function test_player_store_rejects_duplicate_name_within_same_team(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);
        $this->attachPlayerByName($team, 'Carlos');

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/players", [
            'name' => 'Carlos',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure the duplicate check for player names is case-insensitive.
     *
     * @return void Verifies that 'CARLOS' is rejected when 'Carlos' already exists in the team.
     * Logic: add 'Carlos', attempt to add 'CARLOS', and assert 422.
     */
    public function test_player_store_rejects_duplicate_name_case_insensitively(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);
        $this->attachPlayerByName($team, 'Carlos');

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/players", [
            'name' => 'CARLOS',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure the player name is normalised before the duplicate check on store.
     *
     * @return void Verifies that '  Carlos  ' is treated as 'Carlos' for uniqueness.
     * Logic: add 'Carlos', attempt to add '  Carlos  ', and assert 422.
     */
    public function test_player_store_normalises_name_before_duplicate_check(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);
        $this->attachPlayerByName($team, 'Carlos');

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/players", [
            'name' => '  Carlos  ',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure the same player name is allowed in different teams.
     *
     * @return void Verifies that player name uniqueness is scoped to the team, not the game.
     * Logic: add 'Carlos' to team A, add 'Carlos' to team B, and assert 201 for team B.
     */
    public function test_player_store_allows_same_name_in_different_team(): void
    {
        $game  = $this->makeGame();
        $teamA = $this->makeTeam($game, 'Team Alpha');
        $teamB = $this->makeTeam($game, 'Team Beta');
        $this->attachPlayerByName($teamA, 'Carlos');

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$teamB->id}/players", [
            'name' => 'Carlos',
        ]);

        $response->assertStatus(201);
    }

    /**
     * Ensure the stored player name preserves the original casing.
     *
     * @return void Verifies the name is not lower-cased before persistence.
     * Logic: post 'Carlos Garcia' and assert the stored display_name is exactly 'Carlos Garcia'.
     */
    public function test_player_store_preserves_original_casing(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/players", [
            'name' => 'Carlos Garcia',
        ]);

        $response
            ->assertStatus(201)
            ->assertJsonPath('data.game.teams.0.players.0.display_name', 'Carlos Garcia');
    }

    /**
     * Ensure the stored player name contains the normalised form of the submitted value.
     *
     * @return void Verifies leading/trailing spaces and duplicate inner spaces are collapsed.
     * Logic: post '  Carlos   Garcia  ' and assert the stored name is 'Carlos Garcia'.
     */
    public function test_player_store_persists_normalised_name(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/players", [
            'name' => '  Carlos   Garcia  ',
        ]);

        $response
            ->assertStatus(201)
            ->assertJsonPath('data.game.teams.0.players.0.display_name', 'Carlos Garcia');
    }

    /**
     * Ensure a registered user can be added as a player.
     *
     * @return void Verifies user_id-based player assignment returns 201 with user_id in summary.
     * Logic: post a user_id payload and assert the player appears with the correct user_id.
     */
    public function test_can_add_a_registered_user_as_a_player(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);
        $user = User::factory()->create(['name' => 'Alice']);

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/players", [
            'user_id' => $user->id,
            'name'    => $user->name,
        ]);

        $response
            ->assertStatus(201)
            ->assertJsonPath('data.game.teams.0.players.0.user_id', $user->id);
    }

    /**
     * Ensure removing a player from a finished game is rejected with 422.
     *
     * @return void Verifies that players cannot be added to teams in a finished game.
     * Logic: create a finished game with a team, attempt to add a player, and assert an unprocessable response.
     */
    public function test_player_store_rejected_for_finished_game(): void
    {
        $game = $this->makeGame('finished');
        $team = $this->makeTeam($game);

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/players", [
            'name' => 'Carlos',
        ]);

        $response->assertUnprocessable();
    }

    /**
     * Ensure the first player added to team 1 receives seat number 1.
     *
     * @param  none
     * @return void Verifies that seat_number = 1 is assigned to the first player of the first game team.
     * Logic: create a game with one team, add one player, and assert seat_number 1 in the API summary
     * and in the game_player_seat table.
     */
    public function test_first_player_of_first_team_gets_seat_one(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game);

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/players", [
            'name' => 'Carlos',
        ]);

        $response->assertStatus(201);

        $player = $response->json('data.game.teams.0.players.0');
        $this->assertSame(1, $player['seat_number']);

        $this->assertDatabaseHas('game_player_seat', [
            'game_id'     => $game->id,
            'seat_number' => 1,
        ]);
    }

    /**
     * Ensure seat numbers follow the odd/even pattern for two teams.
     *
     * @param  none
     * @return void Verifies team 1 players get odd seats and team 2 players get even seats.
     * Logic: create a game with two teams, add one player to each, and assert seat numbers 1 and 2 respectively.
     */
    public function test_seat_numbers_follow_odd_even_team_pattern(): void
    {
        $game  = $this->makeGame();
        $teamA = $this->makeTeam($game, 'Team Alpha');
        $teamB = $this->makeTeam($game, 'Team Beta');

        $this->postJson("/api/v1/games/{$game->id}/teams/{$teamA->id}/players", ['name' => 'Alice'])
            ->assertStatus(201);

        $this->postJson("/api/v1/games/{$game->id}/teams/{$teamB->id}/players", ['name' => 'Bob'])
            ->assertStatus(201);

        // Fetch the game summary for the final state.
        $summary = $this->getJson("/api/v1/games/{$game->id}")->json('data.game');
        $team1Players = $summary['teams'][0]['players'];
        $team2Players = $summary['teams'][1]['players'];

        $this->assertSame(1, $team1Players[0]['seat_number'], 'First team, first player should have seat 1.');
        $this->assertSame(2, $team2Players[0]['seat_number'], 'Second team, first player should have seat 2.');
    }

    /**
     * Ensure second players in each team get the next odd and even seat numbers.
     *
     * @param  none
     * @return void Verifies seats 3 and 4 for the second player of each team.
     * Logic: add two players per team and assert seats 1, 3 for team 1 and 2, 4 for team 2.
     */
    public function test_second_players_get_seats_three_and_four(): void
    {
        $game  = $this->makeGame();
        $teamA = $this->makeTeam($game, 'Team Alpha');
        $teamB = $this->makeTeam($game, 'Team Beta');

        $this->postJson("/api/v1/games/{$game->id}/teams/{$teamA->id}/players", ['name' => 'Alice']);
        $this->postJson("/api/v1/games/{$game->id}/teams/{$teamA->id}/players", ['name' => 'Anna']);
        $this->postJson("/api/v1/games/{$game->id}/teams/{$teamB->id}/players", ['name' => 'Bob']);
        $this->postJson("/api/v1/games/{$game->id}/teams/{$teamB->id}/players", ['name' => 'Ben']);

        $summary = $this->getJson("/api/v1/games/{$game->id}")->json('data.game');
        $t1 = $summary['teams'][0]['players'];
        $t2 = $summary['teams'][1]['players'];

        $this->assertSame(1, $t1[0]['seat_number']);
        $this->assertSame(3, $t1[1]['seat_number']);
        $this->assertSame(2, $t2[0]['seat_number']);
        $this->assertSame(4, $t2[1]['seat_number']);
    }
}
