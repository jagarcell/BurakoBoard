<?php

namespace Tests\Feature\Api;

use App\Events\RoundDraftUpdated;
use App\Models\Game;
use App\Models\RoundDraft;
use App\Models\Team;
use App\Models\User;
use App\Repositories\GameRepository;
use App\Repositories\TeamRepository;
use App\Services\BurakoGameService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class RoundDraftTest extends TestCase
{
    use RefreshDatabase;

    private GameRepository $gameRepository;
    private TeamRepository $teamRepository;
    private BurakoGameService $service;
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
        $this->service = $this->app->make(BurakoGameService::class);

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
}
