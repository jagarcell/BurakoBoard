<?php

namespace Tests\Feature\Api;

use App\Models\Round;
use App\Models\RoundDraft;
use App\Models\User;
use App\Repositories\GameRepository;
use App\Repositories\TeamRepository;
use App\Services\RoundService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoundAmendmentTest extends TestCase
{
    use RefreshDatabase;

    private GameRepository $gameRepository;
    private TeamRepository $teamRepository;
    private RoundService $roundService;
    private int $gameId;
    private int $teamAId;
    private int $teamBId;

    /**
     * Build an authenticated two-team game fixture before each test.
     *
     * @return void
     * Logic: create one user, one in-progress game, and two attached teams so amendment
     * endpoint tests can focus on persistence behavior.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->gameRepository = $this->app->make(GameRepository::class);
        $this->teamRepository = $this->app->make(TeamRepository::class);
        $this->roundService = $this->app->make(RoundService::class);

        $user = User::factory()->create();
        $this->actingAs($user);

        $game = $this->gameRepository->createGame([
            'name' => 'Amendment Test Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $teamA = $this->teamRepository->createTeam(['name' => 'Team Alpha']);
        $this->teamRepository->attachTeamToGame($game->id, $teamA->id);

        $teamB = $this->teamRepository->createTeam(['name' => 'Team Beta']);
        $this->teamRepository->attachTeamToGame($game->id, $teamB->id);

        $this->gameId = (int) $game->id;
        $this->teamAId = (int) $teamA->id;
        $this->teamBId = (int) $teamB->id;
    }

    /**
     * PATCH /api/v1/games/{gameId}/rounds/{roundNumber} persists amended round scores and archived draft values.
     *
     * @return void
     * Logic: amend an existing recorded round, then verify both round_scores and round_drafts
     * contain the new persisted values.
     */
    public function test_amend_round_persists_scores_and_archived_draft(): void
    {
        $this->roundService->recordRound($this->gameId, [
            'scores' => [
                ['team_id' => $this->teamAId, 'points' => 120],
                ['team_id' => $this->teamBId, 'points' => 80],
            ],
        ]);

        RoundDraft::query()->updateOrCreate(
            ['game_id' => $this->gameId, 'round_number' => 1],
            ['base_inputs' => [$this->teamAId => [1 => false]], 'card_inputs' => [$this->teamAId => ['cardsInHand' => 0, 'cardsOnTable' => 0]]],
        );

        $payload = [
            'scores' => [
                ['team_id' => $this->teamAId, 'points' => 300],
                ['team_id' => $this->teamBId, 'points' => 140],
            ],
            'base_inputs' => [
                (string) $this->teamAId => [1 => true, 2 => 1],
                (string) $this->teamBId => [1 => false, 2 => 0],
            ],
            'card_inputs' => [
                (string) $this->teamAId => ['cardsInHand' => 10, 'cardsOnTable' => 20],
                (string) $this->teamBId => ['cardsInHand' => 5, 'cardsOnTable' => 0],
            ],
        ];

        $response = $this->patchJson("/api/v1/games/{$this->gameId}/rounds/1", $payload)
            ->assertOk();

        $roundId = (int) Round::query()
            ->where('game_id', $this->gameId)
            ->where('round_number', 1)
            ->value('id');

        $this->assertDatabaseHas('round_scores', [
            'round_id' => $roundId,
            'team_id' => $this->teamAId,
            'points' => 300,
        ]);

        $this->assertDatabaseHas('round_scores', [
            'round_id' => $roundId,
            'team_id' => $this->teamBId,
            'points' => 140,
        ]);

        $draft = RoundDraft::query()
            ->where('game_id', $this->gameId)
            ->where('round_number', 1)
            ->firstOrFail();

        $this->assertSame(10, (int) ($draft->card_inputs[(string) $this->teamAId]['cardsInHand'] ?? -1));
        $this->assertSame(20, (int) ($draft->card_inputs[(string) $this->teamAId]['cardsOnTable'] ?? -1));
        $this->assertSame(true, (bool) ($draft->base_inputs[(string) $this->teamAId][1] ?? false));

        $response->assertJsonPath('data.game.rounds.0.round_number', 1);
    }

    /**
     * PATCH /api/v1/games/{gameId}/rounds/{roundNumber} returns 404 when the round number does not exist.
     *
     * @return void
     * Logic: ensure non-existent round targets fail fast instead of creating implicit rounds.
     */
    public function test_amend_round_returns_404_for_unknown_round_number(): void
    {
        $this->patchJson("/api/v1/games/{$this->gameId}/rounds/99", [
            'scores' => [
                ['team_id' => $this->teamAId, 'points' => 100],
                ['team_id' => $this->teamBId, 'points' => 100],
            ],
        ])->assertNotFound();
    }

    /**
     * PATCH /api/v1/games/{gameId}/rounds/{roundNumber} rejects payloads that do not include all teams.
     *
     * @return void
     * Logic: enforce the same complete-team coverage contract used by normal round recording.
     */
    public function test_amend_round_returns_422_when_not_all_teams_are_supplied(): void
    {
        $this->roundService->recordRound($this->gameId, [
            'scores' => [
                ['team_id' => $this->teamAId, 'points' => 10],
                ['team_id' => $this->teamBId, 'points' => 20],
            ],
        ]);

        $this->patchJson("/api/v1/games/{$this->gameId}/rounds/1", [
            'scores' => [
                ['team_id' => $this->teamAId, 'points' => 50],
            ],
        ])->assertUnprocessable();
    }
}
