<?php

namespace Tests\Feature\Api;

use App\Events\RoundDraftUpdated;
use App\Models\Game;
use App\Models\RoundDraft;
use App\Models\Team;
use App\Models\User;
use App\Repositories\GameRepository;
use App\Repositories\TeamRepository;
use App\Services\RoundService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class RoundDraftTest extends TestCase
{
    use RefreshDatabase;

    private GameRepository $gameRepository;
    private TeamRepository $teamRepository;
    private RoundService $service;
    private Game $game;
    private Team $teamA;
    private Team $teamB;
    private User $user;

    /**
     * Set up a game with two teams before each test.
     *
     * @return void
     * Logic: create a minimal in-progress game fixture shared across all draft tests.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->gameRepository = $this->app->make(GameRepository::class);
        $this->teamRepository = $this->app->make(TeamRepository::class);
        $this->service = $this->app->make(RoundService::class);

        $this->user = User::factory()->create();
        $this->actingAs($this->user);

        $this->game = $this->gameRepository->createGame([
            'name' => 'Draft Test Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $this->teamA = $this->teamRepository->createTeam(['name' => 'Alpha']);
        $this->teamRepository->attachTeamToGame($this->game->id, $this->teamA->id);
        $this->teamB = $this->teamRepository->createTeam(['name' => 'Beta']);
        $this->teamRepository->attachTeamToGame($this->game->id, $this->teamB->id);
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
            'expected_current_round_number' => 0,
        ];

        $response = $this->putJson("/api/v1/games/{$this->game->id}/round-draft", $payload);

        $response
            ->assertOk()
            ->assertJsonPath('data.round_draft.card_inputs.' . $this->teamA->id . '.cardsInHand', 5);

        $this->assertDatabaseHas('round_drafts', ['game_id' => $this->game->id]);
    }

    /**
     * PUT /api/v1/games/{id}/round-draft rejects stale payloads after round progression.
     *
     * @return void
     * Logic: simulate a delayed in-flight draft PUT started before round 1 was committed;
     *   once current_round_number has advanced, the stale expected round value must be
     *   rejected and no active draft row should be re-created.
     */
    public function test_upsert_rejects_stale_expected_round_number_after_round_progression(): void
    {
        // Commit round 1 so game.current_round_number advances from 0 -> 1.
        $this->service->recordRound($this->game->id, [
            'scores' => [
                ['team_id' => $this->teamA->id, 'points' => 100],
                ['team_id' => $this->teamB->id, 'points' => 80],
            ],
        ]);

        $this->game->refresh();
        $this->assertSame(1, (int) $this->game->current_round_number);

        $response = $this->putJson("/api/v1/games/{$this->game->id}/round-draft", [
            'base_inputs' => [(string) $this->teamA->id => [1 => true]],
            'card_inputs' => [(string) $this->teamA->id => ['cardsInHand' => 3, 'cardsOnTable' => 0]],
            'expected_current_round_number' => 0,
        ]);

        $response->assertStatus(422);

        $this->assertDatabaseMissing('round_drafts', ['game_id' => $this->game->id, 'round_number' => 0]);
    }

    /**
     * PUT /api/v1/games/{id}/round-draft accepts payloads when expected round matches.
     *
     * @return void
     * Logic: ensures the stale guard does not block valid saves for the current round baseline.
     */
    public function test_upsert_accepts_matching_expected_round_number(): void
    {
        $response = $this->putJson("/api/v1/games/{$this->game->id}/round-draft", [
            'base_inputs' => [(string) $this->teamA->id => [1 => true]],
            'card_inputs' => [(string) $this->teamA->id => ['cardsInHand' => 2, 'cardsOnTable' => 0]],
            'expected_current_round_number' => 0,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('round_drafts', ['game_id' => $this->game->id, 'round_number' => 0]);
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
            'round_number' => 0,
            'base_inputs' => [$this->teamA->id => [1 => true]],
            'card_inputs' => [$this->teamA->id => ['cardsInHand' => 7, 'cardsOnTable' => 0]],
        ]);

        $response = $this->getJson("/api/v1/games/{$this->game->id}/round-draft");

        $response
            ->assertOk()
            ->assertJsonPath('data.round_draft.card_inputs.' . $this->teamA->id . '.cardsInHand', 7);
    }

    /**
     * PUT called twice keeps only one active draft row per game (upsert behaviour).
     *
     * @return void
     * Logic: confirm the unique constraint on (game_id, round_number=0) is respected
     * and the active draft count stays at one after multiple PUT calls for the same game.
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

        $this->assertSame(
            1,
            RoundDraft::query()
                ->where('game_id', $this->game->id)
                ->where('round_number', 0)
                ->count(),
        );
    }

    /**
     * Recording a round archives the draft under the committed round number.
     *
     * @return void
     * Logic: verify that after a round is recorded, the draft row is updated with the
     * round number (archived) rather than deleted, so it can be retrieved as historical detail.
     */
    public function test_recording_a_round_archives_the_draft(): void
    {
        RoundDraft::query()->create([
            'game_id' => $this->game->id,
            'round_number' => 0,
            'base_inputs' => [],
            'card_inputs' => [],
        ]);

        $this->assertDatabaseHas('round_drafts', ['game_id' => $this->game->id, 'round_number' => 0]);

        $this->service->recordRound($this->game->id, [
            'scores' => [
                ['team_id' => $this->teamA->id, 'points' => 100],
                ['team_id' => $this->teamB->id, 'points' => 200],
            ],
        ]);

        // Active draft (round_number = 0) should be gone.
        $this->assertDatabaseMissing('round_drafts', ['game_id' => $this->game->id, 'round_number' => 0]);

        // Archived draft (round_number = 1) should now exist.
        $this->assertDatabaseHas('round_drafts', ['game_id' => $this->game->id, 'round_number' => 1]);
    }

    /**
     * Recording a round with no active draft leaves no draft rows and does not error.
     *
     * @return void
     * Logic: archiveRoundDraft is a no-op when no active draft exists, so recording
     * a round without a prior draft save must succeed and leave the table empty.
     */
    public function test_recording_a_round_without_active_draft_succeeds(): void
    {
        $this->assertDatabaseMissing('round_drafts', ['game_id' => $this->game->id]);

        $this->service->recordRound($this->game->id, [
            'scores' => [
                ['team_id' => $this->teamA->id, 'points' => 50],
                ['team_id' => $this->teamB->id, 'points' => 75],
            ],
        ]);

        $this->assertDatabaseMissing('round_drafts', ['game_id' => $this->game->id]);
    }

    /**
     * GET /api/v1/games/{gameId}/rounds/{roundNumber}/draft returns the archived draft.
     *
     * @return void
     * Logic: record a round that had an active draft, then confirm the new
     * endpoint returns the archived inputs under the correct round number.
     */
    public function test_show_by_round_returns_archived_draft(): void
    {
        RoundDraft::query()->create([
            'game_id' => $this->game->id,
            'round_number' => 0,
            'base_inputs' => [$this->teamA->id => [1 => true]],
            'card_inputs' => [$this->teamA->id => ['cardsInHand' => 3, 'cardsOnTable' => 0]],
        ]);

        $this->service->recordRound($this->game->id, [
            'scores' => [
                ['team_id' => $this->teamA->id, 'points' => 150],
                ['team_id' => $this->teamB->id, 'points' => 100],
            ],
        ]);

        $response = $this->getJson("/api/v1/games/{$this->game->id}/rounds/1/draft");

        $response
            ->assertOk()
            ->assertJsonPath('data.round_draft.card_inputs.' . $this->teamA->id . '.cardsInHand', 3);
    }

    /**
     * GET /api/v1/games/{gameId}/rounds/{roundNumber}/draft returns null when no draft was captured.
     *
     * @return void
     * Logic: when a round was recorded without a prior active draft (e.g. before draft archiving
     * was introduced), the endpoint should return null rather than a 404.
     */
    public function test_show_by_round_returns_null_when_no_draft_captured(): void
    {
        // Record a round without saving a draft first.
        $this->service->recordRound($this->game->id, [
            'scores' => [
                ['team_id' => $this->teamA->id, 'points' => 50],
                ['team_id' => $this->teamB->id, 'points' => 75],
            ],
        ]);

        $response = $this->getJson("/api/v1/games/{$this->game->id}/rounds/1/draft");

        $response
            ->assertOk()
            ->assertJsonPath('data.round_draft', null);
    }

    /**
     * GET /api/v1/games/{gameId}/rounds/{roundNumber}/draft returns 404 for an unknown game.
     *
     * @return void
     * Logic: confirm the service guard raises a model-not-found exception that
     * translates to a 404 when the game id does not exist.
     */
    public function test_show_by_round_returns_404_for_unknown_game(): void
    {
        $this->getJson('/api/v1/games/99999/rounds/1/draft')->assertNotFound();
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

    /**
     * PUT dispatches a RoundDraftUpdated broadcast event after persisting the draft.
     *
     * @return void
     * Logic: verify that saving a draft fires a RoundDraftUpdated event targeting
     * the correct game so viewers subscribed to the private game channel receive
     * the new input values in real time.
     */
    public function test_upsert_dispatches_round_draft_updated_event(): void
    {
        Event::fake([RoundDraftUpdated::class]);

        $payload = [
            'base_inputs' => [
                (string) $this->teamA->id => [1 => true, 2 => 3],
                (string) $this->teamB->id => [1 => false, 2 => 0],
            ],
            'card_inputs' => [
                (string) $this->teamA->id => ['cardsInHand' => 5, 'cardsOnTable' => 0],
                (string) $this->teamB->id => ['cardsInHand' => 0, 'cardsOnTable' => 2],
            ],
        ];

        $this->putJson("/api/v1/games/{$this->game->id}/round-draft", $payload)->assertOk();

        Event::assertDispatched(RoundDraftUpdated::class, function (RoundDraftUpdated $event) {
            return $event->gameId === $this->game->id;
        });
    }

    /**
     * RoundDraftUpdated event broadcasts on the private game channel.
     *
     * @return void
     * Logic: confirm the event targets the correct private channel name so that
     * only authenticated members of the game can receive live draft updates.
     */
    public function test_round_draft_updated_event_broadcasts_on_correct_channel(): void
    {
        $event = new RoundDraftUpdated(
            $this->game->id,
            [(string) $this->teamA->id => [1 => true]],
            [(string) $this->teamA->id => ['cardsInHand' => 3, 'cardsOnTable' => 0]],
        );

        $channels = $event->broadcastOn();

        $this->assertCount(1, $channels);
        $this->assertStringEndsWith('game.' . $this->game->id, $channels[0]->name);
    }

    /**
     * RoundDraftUpdated broadcastWith returns the expected payload shape.
     *
     * @return void
     * Logic: confirm the broadcast payload contains both input maps so the frontend
     * can hydrate all team inputs from a single event without an additional HTTP request.
     */
    public function test_round_draft_updated_event_broadcast_payload(): void
    {
        $baseInputs = [(string) $this->teamA->id => [1 => true]];
        $cardInputs = [(string) $this->teamA->id => ['cardsInHand' => 7, 'cardsOnTable' => 0]];

        $event = new RoundDraftUpdated($this->game->id, $baseInputs, $cardInputs);

        $this->assertSame('round.draft.updated', $event->broadcastAs());
        $this->assertSame(
            ['base_inputs' => $baseInputs, 'card_inputs' => $cardInputs],
            $event->broadcastWith(),
        );
    }

    /**
     * DELETE /api/v1/games/{id}/round-draft removes the active draft and returns 204.
     *
     * @return void
     * Logic: confirm that when an active draft exists, the DELETE endpoint removes
     *   it and returns an empty 204 response so the frontend can confirm the stale
     *   draft has been cleaned up.
     */
    public function test_destroy_deletes_active_draft_and_returns_204(): void
    {
        RoundDraft::query()->create([
            'game_id'      => $this->game->id,
            'round_number' => 0,
            'base_inputs'  => [],
            'card_inputs'  => [],
        ]);

        $this->assertDatabaseHas('round_drafts', ['game_id' => $this->game->id, 'round_number' => 0]);

        $response = $this->deleteJson("/api/v1/games/{$this->game->id}/round-draft");

        $response->assertNoContent();
        $this->assertDatabaseMissing('round_drafts', ['game_id' => $this->game->id, 'round_number' => 0]);
    }

    /**
     * DELETE /api/v1/games/{id}/round-draft returns 204 even when no draft exists (idempotent).
     *
     * @return void
     * Logic: confirm the endpoint does not error when no active draft row is present,
     *   since the frontend fires this delete as a fire-and-forget safety call.
     */
    public function test_destroy_returns_204_when_no_draft_exists(): void
    {
        $this->assertDatabaseMissing('round_drafts', ['game_id' => $this->game->id, 'round_number' => 0]);

        $response = $this->deleteJson("/api/v1/games/{$this->game->id}/round-draft");

        $response->assertNoContent();
    }

    /**
     * DELETE /api/v1/games/{id}/round-draft returns 404 for an unknown game.
     *
     * @return void
     * Logic: confirm the service delegates game lookup before deleting so an
     *   unknown game ID raises a 404 rather than silently doing nothing.
     */
    public function test_destroy_returns_404_for_unknown_game(): void
    {
        $this->deleteJson('/api/v1/games/99999/round-draft')->assertNotFound();
    }

    /**
     * DELETE /api/v1/games/{id}/round-draft requires authentication.
     *
     * @return void
     * Logic: confirm the route is covered by the auth:sanctum middleware so
     *   unauthenticated requests receive a 401 rather than deleting the draft.
     */
    public function test_destroy_requires_authentication(): void
    {
        auth()->logout();

        $this->deleteJson("/api/v1/games/{$this->game->id}/round-draft")->assertUnauthorized();
    }

    /**
     * DELETE /api/v1/games/{id}/round-draft does not affect archived drafts (round_number > 0).
     *
     * @return void
     * Logic: confirm that only the active draft (round_number = 0) is removed so historical
     *   scoring breakdowns for completed rounds are not accidentally deleted.
     */
    public function test_destroy_does_not_delete_archived_drafts(): void
    {
        RoundDraft::query()->create([
            'game_id'      => $this->game->id,
            'round_number' => 1,
            'base_inputs'  => [],
            'card_inputs'  => [],
        ]);

        $this->deleteJson("/api/v1/games/{$this->game->id}/round-draft")->assertNoContent();

        $this->assertDatabaseHas('round_drafts', ['game_id' => $this->game->id, 'round_number' => 1]);
    }
}
