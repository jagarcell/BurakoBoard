<?php

namespace Tests\Feature\Api;

use App\Enums\GameUserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RandomInitialShufflerTest extends TestCase
{
    use RefreshDatabase;

    private User $creator;

    /**
     * Boot a shared creator user for each test.
     *
     * @return void
     * Logic: authenticate once per test so requests pass auth middleware and create-game ownership is deterministic.
     */
    protected function setUp(): void
    {
        parent::setUp();
        $this->creator = User::factory()->create();
        $this->actingAs($this->creator);
    }

    /**
     * Create a game and return its id.
     *
     * @return int Created game id.
     * Logic: uses the public game creation endpoint so ownership and defaults mirror production flow.
     */
    private function createGameAndGetId(): int
    {
        $response = $this->postJson('/api/v1/games', [
            'name' => 'Random Cutter Game',
            'target_points' => 2000,
        ])->assertCreated();

        return (int) $response->json('data.game.game.id');
    }

    /**
     * Add a team to the game and return its id.
     *
     * @param  int  $gameId  Target game id.
     * @param  string  $name  Team name.
     * @return int Created team id.
     * Logic: posts to the team endpoint and extracts the created team from the returned summary.
     */
    private function addTeamAndGetId(int $gameId, string $name): int
    {
        $response = $this->postJson("/api/v1/games/{$gameId}/teams", [
            'name' => $name,
        ])->assertCreated();

        $teams = $response->json('data.game.teams');

        return (int) collect($teams)->firstWhere('name', $name)['id'];
    }

    /**
     * Ensure creator can set a random initial shuffler from seated players.
     *
     * @return void
     * Logic: create game + teams + seated players, call random endpoint, and assert initial shuffler seat is one of the seat numbers.
     */
    public function test_creator_can_set_random_initial_shuffler(): void
    {
        $gameId = $this->createGameAndGetId();
        $teamAId = $this->addTeamAndGetId($gameId, 'Team Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Team Beta');

        $this->postJson("/api/v1/games/{$gameId}/teams/{$teamAId}/players", ['name' => 'Alice'])->assertCreated();
        $this->postJson("/api/v1/games/{$gameId}/teams/{$teamBId}/players", ['name' => 'Bob'])->assertCreated();
        $this->postJson("/api/v1/games/{$gameId}/teams/{$teamAId}/players", ['name' => 'Carol'])->assertCreated();
        $this->postJson("/api/v1/games/{$gameId}/teams/{$teamBId}/players", ['name' => 'Dave'])->assertCreated();

        $response = $this->putJson("/api/v1/games/{$gameId}/shuffler/random");

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success');

        $seat = (int) $response->json('data.game.game.initial_shuffler_seat_number');
        $this->assertContains($seat, [1, 2, 3, 4]);
    }

    /**
     * Ensure non-creator users cannot call random shuffler endpoint.
     *
     * @return void
     * Logic: act as viewer and assert endpoint returns 403.
     */
    public function test_non_creator_cannot_set_random_initial_shuffler(): void
    {
        $gameId = $this->createGameAndGetId();

        $viewer = User::factory()->create();
        DB::table('game_user')->insert([
            'game_id' => $gameId,
            'user_id' => $viewer->id,
            'role' => GameUserRole::Viewer->value,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($viewer);

        $this->putJson("/api/v1/games/{$gameId}/shuffler/random")
            ->assertForbidden();
    }

    /**
     * Ensure random shuffler endpoint rejects when an initial shuffler is already assigned.
     *
     * @return void
     * Logic: set initial shuffler manually once, then call random endpoint and assert 422.
     */
    public function test_random_initial_shuffler_rejects_when_already_assigned(): void
    {
        $gameId = $this->createGameAndGetId();
        $teamAId = $this->addTeamAndGetId($gameId, 'Team Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Team Beta');

        $firstPlayerId = (int) $this->postJson("/api/v1/games/{$gameId}/teams/{$teamAId}/players", ['name' => 'Alice'])
            ->assertCreated()
            ->json('data.game.teams.0.players.0.id');

        $this->postJson("/api/v1/games/{$gameId}/teams/{$teamBId}/players", ['name' => 'Bob'])->assertCreated();

        $this->putJson("/api/v1/games/{$gameId}/shuffler", [
            'player_id' => $firstPlayerId,
        ])->assertOk();

        $this->putJson("/api/v1/games/{$gameId}/shuffler/random")
            ->assertUnprocessable()
            ->assertJsonPath('data.errors.game.0', 'Initial cutter has already been assigned.');
    }
}
