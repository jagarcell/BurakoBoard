<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameRoundsIndexTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    /**
     * Boot a shared authenticated user once per test.
     *
     * @return void
     * Logic: create one User so every helper can authenticate without repeating factory creation.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->actingAs($this->user);
    }

    /**
     * Ensure has_more_rounds is false and total_rounds is correct when rounds are within the limit.
     *
     * @return void Verifies summary envelope for games with few rounds.
     */
    public function test_summary_has_more_rounds_false_when_within_limit(): void
    {
        $gameId  = $this->createGameAndGetId();
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 100],
                ['team_id' => $teamBId, 'points' => 200],
            ],
        ])->assertOk();

        $this->getJson("/api/v1/games/{$gameId}")
            ->assertOk()
            ->assertJsonPath('data.game.total_rounds', 1)
            ->assertJsonPath('data.game.has_more_rounds', false)
            ->assertJsonCount(1, 'data.game.rounds');
    }

    /**
     * Ensure has_more_rounds is true and only the last 50 rounds appear when limit is exceeded.
     *
     * @return void Verifies summary truncation and has_more_rounds flag for large games.
     */
    public function test_summary_truncates_rounds_and_sets_has_more_when_over_limit(): void
    {
        // Override the limit to a small value so the test does not need to insert 51+ rounds.
        config(['game.summary_round_limit' => 3]);

        $gameId  = $this->createGameAndGetId(50000);
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        // Insert 4 rounds — one more than the configured limit of 3.
        for ($i = 0; $i < 4; $i++) {
            $this->postJson("/api/v1/games/{$gameId}/rounds", [
                'scores' => [
                    ['team_id' => $teamAId, 'points' => 100],
                    ['team_id' => $teamBId, 'points' => 50],
                ],
            ])->assertOk();
        }

        $this->getJson("/api/v1/games/{$gameId}")
            ->assertOk()
            ->assertJsonPath('data.game.total_rounds', 4)
            ->assertJsonPath('data.game.has_more_rounds', true)
            ->assertJsonCount(3, 'data.game.rounds');
    }

    /**
     * Ensure GET /games/{gameId}/rounds returns rounds before the given round number.
     *
     * @return void Verifies the paginated rounds endpoint response shape.
     */
    public function test_rounds_endpoint_returns_page_before_given_round(): void
    {
        config(['game.summary_round_limit' => 3]);

        $gameId  = $this->createGameAndGetId(50000);
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        // Insert 4 rounds.
        for ($i = 0; $i < 4; $i++) {
            $this->postJson("/api/v1/games/{$gameId}/rounds", [
                'scores' => [
                    ['team_id' => $teamAId, 'points' => 100],
                    ['team_id' => $teamBId, 'points' => 50],
                ],
            ])->assertOk();
        }

        // Ask for rounds before round 4 with a limit of 2 — should return rounds 3 and 2.
        $response = $this->getJson("/api/v1/games/{$gameId}/rounds?before_round=4&limit=2")
            ->assertOk();

        $items = $response->json('data.rounds.items');
        $this->assertCount(2, $items);
        // Items are ordered ascending; the subquery takes the 2 nearest rounds before 4 (rounds 3 and 2).
        $this->assertSame(2, $items[0]['round_number']);
        $this->assertSame(3, $items[1]['round_number']);
    }

    /**
     * Ensure has_more is true on the paginated endpoint when older rounds still exist.
     *
     * @return void Verifies has_more flag with a limit smaller than the available older rounds.
     */
    public function test_rounds_endpoint_has_more_true_when_older_rounds_remain(): void
    {
        config(['game.summary_round_limit' => 2]);

        $gameId  = $this->createGameAndGetId(50000);
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        // Insert 4 rounds.
        for ($i = 0; $i < 4; $i++) {
            $this->postJson("/api/v1/games/{$gameId}/rounds", [
                'scores' => [
                    ['team_id' => $teamAId, 'points' => 100],
                    ['team_id' => $teamBId, 'points' => 50],
                ],
            ])->assertOk();
        }

        // Fetch the 2 rounds immediately before round 4. Rounds 1 and 2 still exist, so has_more must be true.
        $response = $this->getJson("/api/v1/games/{$gameId}/rounds?before_round=4&limit=2")
            ->assertOk();

        $this->assertTrue($response->json('data.rounds.has_more'));
    }

    /**
     * Ensure the paginated rounds endpoint returns 404 for a non-existent game.
     *
     * @return void Verifies proper 404 handling on the rounds pagination endpoint.
     */
    public function test_rounds_endpoint_returns_404_for_unknown_game(): void
    {
        $this->getJson('/api/v1/games/99999/rounds')->assertNotFound();
    }

    /**
     * Ensure the summary payload includes total_rounds and has_more_rounds keys even for a new game.
     *
     * @return void Verifies new-game summary shape is consistent.
     */
    public function test_summary_includes_total_rounds_and_has_more_rounds_on_new_game(): void
    {
        $gameId = $this->createGameAndGetId();

        $this->getJson("/api/v1/games/{$gameId}")
            ->assertOk()
            ->assertJsonPath('data.game.total_rounds', 0)
            ->assertJsonPath('data.game.has_more_rounds', false);
    }

    /**
     * Ensure rounds in the paginated endpoint contain the expected scores shape.
     *
     * @return void Verifies scores array inside each round item.
     */
    public function test_rounds_endpoint_items_contain_scores(): void
    {
        $gameId  = $this->createGameAndGetId(50000);
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 150],
                ['team_id' => $teamBId, 'points' => 75],
            ],
        ])->assertOk();

        $response = $this->getJson("/api/v1/games/{$gameId}/rounds?before_round=999")
            ->assertOk();

        $items = $response->json('data.rounds.items');
        $this->assertCount(1, $items);
        $this->assertSame(1, $items[0]['round_number']);
        $this->assertCount(2, $items[0]['scores']);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Create a new game and return its id.
     *
     * @param  int  $targetPoints  Winning threshold for the created game.
     * @return int Created game id.
     * Logic: POST to the games endpoint and extract the id from the response.
     */
    private function createGameAndGetId(int $targetPoints = 2000): int
    {
        $response = $this->postJson('/api/v1/games', [
            'name'          => 'Test Game',
            'target_points' => $targetPoints,
        ]);

        return (int) $response->json('data.game.game.id');
    }

    /**
     * Add a team to a game and return the team id.
     *
     * @param  int     $gameId  Game identifier.
     * @param  string  $name    Team name.
     * @return int Created team id.
     * Logic: POST to the teams endpoint and find the returned team by name to avoid
     *   always picking index 0 when multiple teams are already attached.
     */
    private function addTeamAndGetId(int $gameId, string $name): int
    {
        $response = $this->postJson("/api/v1/games/{$gameId}/teams", ['name' => $name])
            ->assertCreated();

        $teams = $response->json('data.game.teams');

        return (int) collect($teams)->firstWhere('name', $name)['id'];
    }
}
