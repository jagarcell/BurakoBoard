<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\RoundDraft;
use App\Models\Team;
use App\Repositories\BurakoGameRepository;
use App\Services\BurakoGameService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoundDraftTest extends TestCase
{
    use RefreshDatabase;

    private BurakoGameRepository $repository;
    private BurakoGameService $service;
    private Game $game;
    private Team $teamA;
    private Team $teamB;

    /**
     * Set up a game with two teams before each test.
     *
     * @return void
     * Logic: create a minimal in-progress game fixture shared across all draft tests.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->repository = $this->app->make(BurakoGameRepository::class);
        $this->service = $this->app->make(BurakoGameService::class);

        $this->game = $this->repository->createGame([
            'name' => 'Draft Test Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $this->teamA = $this->repository->createTeam($this->game->id, ['name' => 'Alpha']);
        $this->teamB = $this->repository->createTeam($this->game->id, ['name' => 'Beta']);
    }

    /**
     * GET /api/v1/games/{id}/round-draft returns null when no draft exists.
     *
     * @return void
     * Logic: confirm the endpoint returns a well-formed null response for a game
     * that has never had any draft inputs saved.
     */
    public function test_show_returns_null_when_no_draft_exists(): void
    {
        $response = $this->getJson("/api/v1/games/{$this->game->id}/round-draft");

        $response
            ->assertOk()
            ->assertJsonPath('data.round_draft', null);
    }

    /**
     * GET /api/v1/games/{id}/round-draft returns 404 for an unknown game.
     *
     * @return void
     * Logic: confirm the endpoint delegates game lookup to the service which
     * raises a model-not-found exception translated to a 404 response.
     */
    public function test_show_returns_404_for_unknown_game(): void
    {
        $this->getJson('/api/v1/games/99999/round-draft')->assertNotFound();
    }

    /**
     * PUT /api/v1/games/{id}/round-draft creates a new draft and returns it.
     *
     * @return void
     * Logic: verify that the upsert endpoint persists both input maps and
     * echoes the stored values back in the response envelope.
     */
    public function test_upsert_creates_draft_and_returns_it(): void
    {
        $payload = [
            'base_inputs' => [
                (string) $this->teamA->id => [1 => true, 2 => 3],
                (string) $this->teamB->id => [1 => false, 2 => 1],
            ],
            'card_inputs' => [
                (string) $this->teamA->id => ['cardsInHand' => 5, 'cardsOnTable' => 0],
                (string) $this->teamB->id => ['cardsInHand' => 0, 'cardsOnTable' => 2],
            ],
        ];

        $response = $this->putJson("/api/v1/games/{$this->game->id}/round-draft", $payload);

        $response
            ->assertOk()
            ->assertJsonPath('data.round_draft.card_inputs.' . $this->teamA->id . '.cardsInHand', 5);

        $this->assertDatabaseHas('round_drafts', ['game_id' => $this->game->id]);
    }

    /**
     * GET /api/v1/games/{id}/round-draft returns the draft after it has been saved.
     *
     * @return void
     * Logic: verify the full read-back flow: save a draft then retrieve it and
     * confirm the stored values match what was originally PUTted.
     */
    public function test_show_returns_saved_draft(): void
    {
        RoundDraft::query()->create([
            'game_id' => $this->game->id,
            'base_inputs' => [$this->teamA->id => [1 => true]],
            'card_inputs' => [$this->teamA->id => ['cardsInHand' => 7, 'cardsOnTable' => 0]],
        ]);

        $response = $this->getJson("/api/v1/games/{$this->game->id}/round-draft");

        $response
            ->assertOk()
            ->assertJsonPath('data.round_draft.card_inputs.' . $this->teamA->id . '.cardsInHand', 7);
    }

    /**
     * PUT called twice keeps only one draft row per game (upsert behaviour).
     *
     * @return void
     * Logic: confirm the unique constraint on game_id is respected and the
     * row count stays at one after multiple PUT calls for the same game.
     */
    public function test_upsert_replaces_existing_draft(): void
    {
        $this->putJson("/api/v1/games/{$this->game->id}/round-draft", [
            'base_inputs' => [$this->teamA->id => [1 => true]],
            'card_inputs' => [],
        ])->assertOk();

        $this->putJson("/api/v1/games/{$this->game->id}/round-draft", [
            'base_inputs' => [$this->teamA->id => [1 => false]],
            'card_inputs' => [],
        ])->assertOk();

        $this->assertSame(1, RoundDraft::query()->where('game_id', $this->game->id)->count());
    }

    /**
     * Recording a round deletes the draft for that game.
     *
     * @return void
     * Logic: verify the automatic draft cleanup that happens as part of recordRound
     * so that stale draft inputs are not shown to the user after a round is saved.
     */
    public function test_recording_a_round_deletes_the_draft(): void
    {
        RoundDraft::query()->create([
            'game_id' => $this->game->id,
            'base_inputs' => [],
            'card_inputs' => [],
        ]);

        $this->assertDatabaseHas('round_drafts', ['game_id' => $this->game->id]);

        $this->service->recordRound($this->game->id, [
            'scores' => [
                ['team_id' => $this->teamA->id, 'points' => 100],
                ['team_id' => $this->teamB->id, 'points' => 200],
            ],
        ]);

        $this->assertDatabaseMissing('round_drafts', ['game_id' => $this->game->id]);
    }

    /**
     * PUT returns 422 when trying to save a draft for a finished game.
     *
     * @return void
     * Logic: verify the service guard that blocks draft saves after a game
     * has concluded so no misleading draft state is persisted.
     */
    public function test_upsert_is_rejected_for_finished_game(): void
    {
        $this->game->update(['status' => 'finished']);

        $this->putJson("/api/v1/games/{$this->game->id}/round-draft", [
            'base_inputs' => [],
            'card_inputs' => [],
        ])->assertUnprocessable();
    }
}
