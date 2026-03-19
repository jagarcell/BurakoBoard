<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
        $team = Team::query()->create(['name' => $name]);
        DB::table('game_team')->insert([
            'game_id'       => $game->id,
            'team_id'       => $team->id,
            'current_score' => 0,
        ]);

        return $team;
    }

    /**
     * Attach a named player to an existing team for test setup.
     *
     * @param  \App\Models\Team  $team  Team that should receive the player.
     * @param  string  $name  Player display name.
     * @return \App\Models\Player Newly created player linked to the team.
     * Logic: create a standalone player record and attach it through the team_player pivot
     * so attach-team tests can verify seat assignment for pre-existing rosters.
     */
    private function attachPlayerByName(Team $team, string $name): Player
    {
        $player = Player::query()->create(['user_id' => null, 'display_name' => $name]);
        $team->players()->attach($player->id);

        return $player;
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
     * Ensure a duplicate team name across different games is rejected on store.
     *
     * @return void Verifies global name uniqueness on create.
     * Logic: add a team named 'Team Alpha' in game A, then attempt to add 'Team Alpha' in game B and assert 422.
     */
    public function test_team_store_rejects_duplicate_name_across_different_games(): void
    {
        $gameA = $this->makeGame();
        $gameB = $this->makeGame();
        $this->makeTeam($gameA, 'Team Alpha');

        $response = $this->postJson("/api/v1/games/{$gameB->id}/teams", [
            'name' => 'Team Alpha',
        ]);

        $response->assertUnprocessable();
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

    /**
     * Ensure an existing global team can be attached to a game without creating a new entity.
     *
     * @return void Verifies the attach endpoint returns 201 with the team included in the summary.
     * Logic: create a team in game A, then call the attach endpoint on game B and assert the same
     * team id appears in the returned summary without extra rows in the teams table.
     */
    public function test_attach_adds_existing_team_to_game_without_creating_new_record(): void
    {
        $gameA = $this->makeGame();
        $gameB = $this->makeGame();
        $team  = $this->makeTeam($gameA, 'Shared Team');

        $response = $this->postJson("/api/v1/games/{$gameB->id}/teams/{$team->id}/attach");

        $response
            ->assertStatus(201)
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.teams.0.id', $team->id);

        // Only one team row should exist globally (no duplicate created).
        $this->assertDatabaseCount('teams', 1);
    }

    /**
     * Ensure attaching an existing team seats its already-linked players immediately.
     *
     * @return void Verifies seat assignment is created during attach, without waiting for add-player calls.
     * Logic: create team A with one player and team B with one player in source game, attach both teams
     * to a new game, and assert odd/even seats are present in the attach response and game_player_seat table.
     */
    public function test_attach_assigns_seats_for_existing_team_players_immediately(): void
    {
        $sourceGame = $this->makeGame();
        $targetGame = $this->makeGame();

        $teamA = $this->makeTeam($sourceGame, 'Team Alpha');
        $alice = $this->attachPlayerByName($teamA, 'Alice');

        $teamB = $this->makeTeam($sourceGame, 'Team Beta');
        $bob = $this->attachPlayerByName($teamB, 'Bob');

        $this->postJson("/api/v1/games/{$targetGame->id}/teams/{$teamA->id}/attach")
            ->assertStatus(201)
            ->assertJsonPath('data.game.teams.0.players.0.seat_number', 1);

        $this->postJson("/api/v1/games/{$targetGame->id}/teams/{$teamB->id}/attach")
            ->assertStatus(201)
            ->assertJsonPath('data.game.teams.1.players.0.seat_number', 2);

        $this->assertDatabaseHas('game_player_seat', [
            'game_id' => $targetGame->id,
            'player_id' => $alice->id,
            'seat_number' => 1,
        ]);

        $this->assertDatabaseHas('game_player_seat', [
            'game_id' => $targetGame->id,
            'player_id' => $bob->id,
            'seat_number' => 2,
        ]);
    }

    /**
     * Ensure seats are correct when the lower-id team is attached second.
     *
     * @return void Verifies that attaching a team with a lower database id after a higher-id team
     *              correctly reassigns all seats so neither team ends up with conflicting or missing seats.
     * Logic: create teamHigh before teamLow so teamHigh has the lower id. Attach teamHigh to the
     * target game first (so it temporarily takes slot 0 with odd seats), then attach teamLow.
     * After teamLow is attached, DB ordering puts teamLow at slot 0 (odd) and teamHigh at slot 1
     * (even). Assert that both players end up with the correct non-overlapping seats and that
     * teamHigh's seat was corrected from odd to even.
     */
    public function test_attach_corrects_seats_when_lower_id_team_added_second(): void
    {
        $sourceGame = $this->makeGame();
        $targetGame = $this->makeGame();

        // teamLow intentionally created first so it gets a lower auto-increment id.
        $teamLow  = $this->makeTeam($sourceGame, 'Team Low');
        $playerLow = $this->attachPlayerByName($teamLow, 'PlayerLow');

        // teamHigh is created second so it gets a higher id.
        $teamHigh = $this->makeTeam($sourceGame, 'Team High');
        $playerHigh = $this->attachPlayerByName($teamHigh, 'PlayerHigh');

        // Attach the higher-id team first. At this point it is the only team → slot 0 → seat 1.
        $this->postJson("/api/v1/games/{$targetGame->id}/teams/{$teamHigh->id}/attach")
            ->assertStatus(201);

        // Attach the lower-id team second. This triggers a full re-seat:
        //   teamLow  (lower id) → slot 0 → seat 1 (odd)
        //   teamHigh (higher id) → slot 1 → seat 2 (even)
        $response = $this->postJson("/api/v1/games/{$targetGame->id}/teams/{$teamLow->id}/attach")
            ->assertStatus(201);

        // API response must reflect the corrected seats.
        $response->assertJsonPath('data.game.teams.0.players.0.seat_number', 1);
        $response->assertJsonPath('data.game.teams.1.players.0.seat_number', 2);

        // Database must have the corrected seat rows with no duplicates.
        $this->assertDatabaseHas('game_player_seat', [
            'game_id'     => $targetGame->id,
            'player_id'   => $playerLow->id,
            'seat_number' => 1,
        ]);

        $this->assertDatabaseHas('game_player_seat', [
            'game_id'     => $targetGame->id,
            'player_id'   => $playerHigh->id,
            'seat_number' => 2,
        ]);

        // No seat number may be duplicated within the same game.
        $seatNumbers = DB::table('game_player_seat')
            ->where('game_id', $targetGame->id)
            ->pluck('seat_number')
            ->all();

        $this->assertCount(count(array_unique($seatNumbers)), $seatNumbers, 'Seat numbers must be unique per game.');
    }

    /**
     * Ensure the attach endpoint returns 422 when the team is already part of the game.
     *
     * @return void Verifies duplicate attach attempts are rejected.
     * Logic: attach a team to a game, then attempt to attach the same team again and assert 422.
     */
    public function test_attach_rejects_team_already_in_game(): void
    {
        $game = $this->makeGame();
        $team = $this->makeTeam($game, 'Alpha');

        $response = $this->postJson("/api/v1/games/{$game->id}/teams/{$team->id}/attach");

        $response->assertUnprocessable();
    }
}
