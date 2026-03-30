<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GameRematchTest extends TestCase
{
    use RefreshDatabase;

    private User $creator;

    /**
     * Boot a shared authenticated creator user for each test.
     *
     * @return void
     * Logic: create one User model so test helpers can call actingAs without repeating factory calls.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->creator = User::factory()->create();
    }

    /**
     * Create a finished game record with two teams and four seated players.
     *
     * @param  int  $rounds  Number of rounds played (used as current_round_number).
     * @return array{game: \App\Models\Game, teamA: \App\Models\Team, teamB: \App\Models\Team} Game and teams.
     * Logic: build the minimal database state that the rematch service requires:
     *   a finished game, two teams attached via pivot, four players with seat assignments,
     *   and a creator pivot row for the test user.
     */
    private function makeFinishedGame(int $rounds = 3): array
    {
        $game = Game::query()->create([
            'name'                         => 'Friday Burako',
            'target_points'                => 2000,
            'status'                       => 'finished',
            'winning_team_id'              => null,
            'current_round_number'         => $rounds,
            'initial_shuffler_seat_number' => 1,
        ]);

        DB::table('game_user')->insert([
            'game_id'    => $game->id,
            'user_id'    => $this->creator->id,
            'role'       => 'creator',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $teamA = Team::query()->create(['name' => 'Alpha']);
        $teamB = Team::query()->create(['name' => 'Beta']);

        DB::table('game_team')->insert([
            ['game_id' => $game->id, 'team_id' => $teamA->id, 'current_score' => 2100],
            ['game_id' => $game->id, 'team_id' => $teamB->id, 'current_score' => 1800],
        ]);

        $players = collect(range(1, 4))->map(fn ($i) => Player::query()->create([
            'display_name' => "Player {$i}",
            'user_id'      => null,
        ]));

        DB::table('team_player')->insert([
            ['team_id' => $teamA->id, 'player_id' => $players[0]->id],
            ['team_id' => $teamA->id, 'player_id' => $players[1]->id],
            ['team_id' => $teamB->id, 'player_id' => $players[2]->id],
            ['team_id' => $teamB->id, 'player_id' => $players[3]->id],
        ]);

        DB::table('game_player_seat')->insert([
            ['game_id' => $game->id, 'player_id' => $players[0]->id, 'seat_number' => 1],
            ['game_id' => $game->id, 'player_id' => $players[2]->id, 'seat_number' => 2],
            ['game_id' => $game->id, 'player_id' => $players[1]->id, 'seat_number' => 3],
            ['game_id' => $game->id, 'player_id' => $players[3]->id, 'seat_number' => 4],
        ]);

        return ['game' => $game, 'teamA' => $teamA, 'teamB' => $teamB, 'players' => $players];
    }

    /**
     * Ensure an unauthenticated caller cannot create a rematch.
     *
     * @return void Verifies the sanctum guard returns 401 for guests.
     * Logic: call the rematch endpoint without authentication and assert 401.
     */
    public function test_unauthenticated_user_cannot_create_rematch(): void
    {
        ['game' => $game] = $this->makeFinishedGame();

        $this->postJson("/api/v1/games/{$game->id}/rematch", [
            'name'          => 'Rematch',
            'target_points' => 2000,
        ])->assertStatus(401);
    }

    /**
     * Ensure a viewer cannot start a rematch of a game they did not create.
     *
     * @return void Verifies 403 is returned when caller is not the creator.
     * Logic: attach a second user as viewer and attempt the rematch endpoint as that user.
     */
    public function test_viewer_cannot_create_rematch(): void
    {
        ['game' => $game] = $this->makeFinishedGame();

        $viewer = User::factory()->create();
        DB::table('game_user')->insert([
            'game_id'    => $game->id,
            'user_id'    => $viewer->id,
            'role'       => 'viewer',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($viewer)
            ->postJson("/api/v1/games/{$game->id}/rematch", [
                'name'          => 'Rematch',
                'target_points' => 2000,
            ])
            ->assertStatus(403);
    }

    /**
     * Ensure rematching an in-progress game is rejected with a validation error.
     *
     * @return void Verifies 422 is returned when the source game is not finished.
     * Logic: create an in-progress game, attach creator pivot row, and call the rematch endpoint.
     */
    public function test_cannot_rematch_in_progress_game(): void
    {
        $game = Game::query()->create([
            'name'                         => 'Ongoing',
            'target_points'                => 2000,
            'status'                       => 'in_progress',
            'winning_team_id'              => null,
            'current_round_number'         => 0,
            'initial_shuffler_seat_number' => null,
        ]);

        DB::table('game_user')->insert([
            'game_id'    => $game->id,
            'user_id'    => $this->creator->id,
            'role'       => 'creator',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$game->id}/rematch", [
                'name'          => 'Rematch',
                'target_points' => 2000,
            ])
            ->assertStatus(422);
    }

    /**
     * Ensure a rematch requires a name and a positive target points value.
     *
     * @return void Verifies 422 is returned when the request payload is invalid.
     * Logic: test with blank name and zero target_points to trigger validation failures.
     */
    public function test_rematch_validates_required_fields(): void
    {
        ['game' => $game] = $this->makeFinishedGame();

        $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$game->id}/rematch", [
                'name'          => '',
                'target_points' => 0,
            ])
            ->assertStatus(422)
            ->assertJsonPath('status', 'error');
    }

    /**
     * Ensure a creator can successfully create a rematch of a finished game.
     *
     * @return void Verifies 201 response with new game payload.
     * Logic: post the rematch endpoint as the creator and assert the returned game reflects
     *   the chosen name, target points, in_progress status, and round number reset to 0.
     */
    public function test_creator_can_create_rematch(): void
    {
        ['game' => $game] = $this->makeFinishedGame();

        $response = $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$game->id}/rematch", [
                'name'          => 'Rematch Friday',
                'target_points' => 3000,
            ]);

        $response
            ->assertStatus(201)
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.game.name', 'Rematch Friday')
            ->assertJsonPath('data.game.game.target_points', 3000)
            ->assertJsonPath('data.game.game.status', 'in_progress')
            ->assertJsonPath('data.game.game.current_round_number', 0)
            ->assertJsonPath('data.game.game.rematch_from_game_id', $game->id);
    }

    /**
     * Ensure the rematch game reuses the same two teams from the source game.
     *
     * @return void Verifies both teams are attached to the new game.
     * Logic: create the rematch and assert both source team names appear in the teams payload.
     */
    public function test_rematch_carries_over_teams(): void
    {
        ['game' => $game, 'teamA' => $teamA, 'teamB' => $teamB] = $this->makeFinishedGame();

        $response = $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$game->id}/rematch", [
                'name'          => 'Rematch',
                'target_points' => 2000,
            ]);

        $response->assertStatus(201);

        $teamNames = collect($response->json('data.game.teams'))->pluck('name');

        $this->assertTrue($teamNames->contains($teamA->name));
        $this->assertTrue($teamNames->contains($teamB->name));
    }

    /**
     * Ensure the rematch game preserves the seat assignments from the source game.
     *
     * @return void Verifies that every player in the new game has the same seat number as in the source.
     * Logic: collect seat rows from the new game via DB and compare against the source game's seats.
     */
    public function test_rematch_copies_seat_assignments(): void
    {
        ['game' => $game] = $this->makeFinishedGame();

        $response = $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$game->id}/rematch", [
                'name'          => 'Rematch',
                'target_points' => 2000,
            ]);

        $response->assertStatus(201);

        $newGameId = $response->json('data.game.game.id');

        $sourceSeats = DB::table('game_player_seat')
            ->where('game_id', $game->id)
            ->orderBy('seat_number')
            ->get(['player_id', 'seat_number']);

        $newSeats = DB::table('game_player_seat')
            ->where('game_id', $newGameId)
            ->orderBy('seat_number')
            ->get(['player_id', 'seat_number']);

        $this->assertEquals($sourceSeats->count(), $newSeats->count());

        foreach ($sourceSeats as $index => $sourceRow) {
            $this->assertEquals((int) $sourceRow->player_id, (int) $newSeats[$index]->player_id);
            $this->assertEquals((int) $sourceRow->seat_number, (int) $newSeats[$index]->seat_number);
        }
    }

    /**
     * Ensure the rematch sets the initial shuffler to the next cutter rotation.
     *
     * @return void Verifies initial_shuffler_seat_number advances by one rotation from the source.
     * Logic: source game has initial_shuffler_seat=1 and current_round_number=3; seated order is
     *   1,2,3,4 so the next cutter index is (0 + 3) % 4 = 3 → seat 4.
     */
    public function test_rematch_sets_next_cutter_as_initial_shuffler(): void
    {
        // current_round_number=3, initial seat=1, seats=[1,2,3,4], next = index (0+3)%4=3 → seat 4
        ['game' => $game] = $this->makeFinishedGame(rounds: 3);

        $response = $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$game->id}/rematch", [
                'name'          => 'Rematch',
                'target_points' => 2000,
            ]);

        $response->assertStatus(201);

        $newGameId = $response->json('data.game.game.id');

        $newGame = Game::query()->findOrFail($newGameId);

        $this->assertEquals(4, $newGame->initial_shuffler_seat_number);
    }

    /**
     * Ensure the new game's scores start at zero regardless of source game scores.
     *
     * @return void Verifies game_team pivot current_score is 0 for both teams in the new game.
     * Logic: the rematch should always start fresh ; check the DB pivot rows directly.
     */
    public function test_rematch_starts_with_zero_scores(): void
    {
        ['game' => $game] = $this->makeFinishedGame();

        $response = $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$game->id}/rematch", [
                'name'          => 'Rematch',
                'target_points' => 2000,
            ]);

        $response->assertStatus(201);

        $newGameId = $response->json('data.game.game.id');

        $scores = DB::table('game_team')
            ->where('game_id', $newGameId)
            ->pluck('current_score');

        foreach ($scores as $score) {
            $this->assertEquals(0, (int) $score);
        }
    }

    /**
     * Ensure that pending_invitee and viewer users from the source game automatically
     * receive invitations to the rematch game when it is created.
     *
     * @return void Verifies game_user rows are created for both users in the new game.
     * Logic: seed a finished game with one pending_invitee and one viewer, call the rematch
     *   endpoint, and assert both users appear as pending_invitee in the new game's pivot.
     */
    public function test_rematch_sends_invitations_to_pending_invitees_and_viewers(): void
    {
        ['game' => $game] = $this->makeFinishedGame();

        $pendingInvitee = User::factory()->create();
        $viewer         = User::factory()->create();

        DB::table('game_user')->insert([
            [
                'game_id'    => $game->id,
                'user_id'    => $pendingInvitee->id,
                'role'       => 'pending_invitee',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'game_id'    => $game->id,
                'user_id'    => $viewer->id,
                'role'       => 'viewer',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $response = $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$game->id}/rematch", [
                'name'          => 'Rematch',
                'target_points' => 2000,
            ]);

        $response->assertStatus(201);

        $newGameId = $response->json('data.game.game.id');

        $this->assertDatabaseHas('game_user', [
            'game_id' => $newGameId,
            'user_id' => $pendingInvitee->id,
            'role'    => 'pending_invitee',
        ]);

        $this->assertDatabaseHas('game_user', [
            'game_id' => $newGameId,
            'user_id' => $viewer->id,
            'role'    => 'pending_invitee',
        ]);
    }

    /**
     * Ensure the rematch-chain endpoint returns every game in the chain, ordered from root to latest.
     *
     * @return void Verifies all three games are present and the ordering is ascending by id.
     * Logic: create a root game and two successive rematches, then call the chain endpoint for
     *   the middle game and assert all three ids are returned in creation order.
     */
    public function test_rematch_chain_returns_all_games_in_chain(): void
    {
        ['game' => $root] = $this->makeFinishedGame();

        // First rematch.
        $firstRematch = $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$root->id}/rematch", [
                'name'          => 'Rematch 1',
                'target_points' => 2000,
            ]);
        $firstRematch->assertStatus(201);
        $firstId = $firstRematch->json('data.game.game.id');

        // Mark the first rematch as finished so a second rematch can be created.
        Game::query()->where('id', $firstId)->update([
            'status' => 'finished',
        ]);

        // Second rematch off the first rematch.
        $secondRematch = $this->actingAs($this->creator)
            ->postJson("/api/v1/games/{$firstId}/rematch", [
                'name'          => 'Rematch 2',
                'target_points' => 2000,
            ]);
        $secondRematch->assertStatus(201);
        $secondId = $secondRematch->json('data.game.game.id');

        // Query the chain from the middle game.
        $response = $this->getJson("/api/v1/games/{$firstId}/rematch-chain");

        $response->assertStatus(200);

        $ids = collect($response->json('data.games'))->pluck('id')->all();

        $this->assertContains($root->id, $ids);
        $this->assertContains($firstId, $ids);
        $this->assertContains($secondId, $ids);
        $this->assertCount(3, $ids);
        $this->assertEquals([$root->id, $firstId, $secondId], $ids);
    }

    /**
     * Ensure the rematch-chain endpoint returns only the single game when it has no chain.
     *
     * @return void Verifies a solo game returns a one-item list with itself.
     * Logic: create a game that was never part of a rematch and assert the chain contains
     *   exactly that game with rematch_from_game_id equal to null.
     */
    public function test_rematch_chain_for_single_game_returns_only_itself(): void
    {
        ['game' => $game] = $this->makeFinishedGame();

        $response = $this->getJson("/api/v1/games/{$game->id}/rematch-chain");

        $response->assertStatus(200);

        $games = $response->json('data.games');

        $this->assertCount(1, $games);
        $this->assertEquals($game->id, $games[0]['id']);
        $this->assertNull($games[0]['rematch_from_game_id']);
    }
}
