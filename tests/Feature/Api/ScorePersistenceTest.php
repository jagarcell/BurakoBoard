<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\Team;
use App\Models\User;
use App\Repositories\RoundRepository;
use App\Repositories\TeamRepository;
use App\Services\BurakoGameService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class ScorePersistenceTest extends TestCase
{
    use RefreshDatabase;

    private TeamRepository $teamRepository;
    private BurakoGameService $service;
    private User $user;

    /**
     * Boot the repository, service, and a shared authenticated user once per test.
     *
     * @return void
     * Logic: resolve concrete instances from the container so they use the same database
     *   connection as the test; create one User so createGameAndGetId can authenticate.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->teamRepository = $this->app->make(TeamRepository::class);
        $this->service    = $this->app->make(BurakoGameService::class);
        $this->user       = User::factory()->create();
        $this->actingAs($this->user);
    }

    /**
     * Ensure current_score is stored in the database after the first round.
     *
     * @return void Verifies DB row reflects round points immediately after recording.
     */
    public function test_current_score_is_persisted_after_recording_a_round(): void
    {
        $gameId = $this->createGameAndGetId();
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 350],
                ['team_id' => $teamBId, 'points' => 200],
            ],
        ])->assertOk();

        $this->assertDatabaseHas('game_team', ['team_id' => $teamAId, 'current_score' => 350]);
        $this->assertDatabaseHas('game_team', ['team_id' => $teamBId, 'current_score' => 200]);
    }

    /**
     * Ensure current_score accumulates correctly across multiple rounds.
     *
     * @return void Verifies the running total after three rounds matches the sum of per-round points.
     */
    public function test_current_score_accumulates_across_multiple_rounds(): void
    {
        $gameId = $this->createGameAndGetId(5000);
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        foreach ([
            [300, 100],
            [400, 200],
            [-50, 150],
        ] as [$aPoints, $bPoints]) {
            $this->postJson("/api/v1/games/{$gameId}/rounds", [
                'scores' => [
                    ['team_id' => $teamAId, 'points' => $aPoints],
                    ['team_id' => $teamBId, 'points' => $bPoints],
                ],
            ])->assertOk();
        }

        // Alpha: 300 + 400 + (−50) = 650  |  Beta: 100 + 200 + 150 = 450
        $this->assertDatabaseHas('game_team', ['team_id' => $teamAId, 'current_score' => 650]);
        $this->assertDatabaseHas('game_team', ['team_id' => $teamBId, 'current_score' => 450]);
    }

    /**
     * Ensure recomputeTeamScoreFromHistory repairs a drifted current_score.
     *
     * @return void Verifies that after manually corrupting the score, the recompute restores the correct value.
     */
    public function test_recompute_team_score_from_history_repairs_drifted_score(): void
    {
        $gameId = $this->createGameAndGetId(5000);
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 600],
                ['team_id' => $teamBId, 'points' => 400],
            ],
        ])->assertOk();

        // Simulate drift by directly corrupting the stored score.
        DB::table('game_team')->where('team_id', $teamAId)->where('game_id', $gameId)->update(['current_score' => 9999]);
        $this->assertDatabaseHas('game_team', ['team_id' => $teamAId, 'current_score' => 9999]);

        $recomputed = $this->teamRepository->recomputeTeamScoreFromHistory($gameId, $teamAId);

        $this->assertSame(600, $recomputed);
        $this->assertDatabaseHas('game_team', ['team_id' => $teamAId, 'current_score' => 600]);
    }

    /**
     * Ensure syncTeamScoresForGame repairs all teams in a game at once.
     *
     * @return void Verifies both team rows are corrected in a single sync call.
     */
    public function test_sync_team_scores_for_game_repairs_all_teams(): void
    {
        $gameId = $this->createGameAndGetId(5000);
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 700],
                ['team_id' => $teamBId, 'points' => 300],
            ],
        ])->assertOk();

        // Corrupt both scores.
        DB::table('game_team')->where('game_id', $gameId)->whereIn('team_id', [$teamAId, $teamBId])->update(['current_score' => 0]);

        $this->teamRepository->syncTeamScoresForGame($gameId);

        $this->assertDatabaseHas('game_team', ['team_id' => $teamAId, 'current_score' => 700]);
        $this->assertDatabaseHas('game_team', ['team_id' => $teamBId, 'current_score' => 300]);
    }

    /**
     * Ensure syncGameScores service method repairs all team scores through the service layer.
     *
     * @return void Verifies the service delegates correctly to the repository.
     */
    public function test_sync_game_scores_service_method_repairs_all_teams(): void
    {
        $gameId = $this->createGameAndGetId(5000);
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 250],
                ['team_id' => $teamBId, 'points' => 750],
            ],
        ])->assertOk();

        // Corrupt scores.
        DB::table('game_team')->where('game_id', $gameId)->whereIn('team_id', [$teamAId, $teamBId])->update(['current_score' => -1]);

        $this->service->syncGameScores($gameId);

        $this->assertDatabaseHas('game_team', ['team_id' => $teamAId, 'current_score' => 250]);
        $this->assertDatabaseHas('game_team', ['team_id' => $teamBId, 'current_score' => 750]);
    }

    /**
     * Ensure recomputing a team with no rounds returns zero and persists it.
     *
     * @return void Verifies the recompute handles the zero-round base case correctly.
     */
    public function test_recompute_returns_zero_for_team_with_no_rounds(): void
    {
        $gameId = $this->createGameAndGetId();
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $this->addTeamAndGetId($gameId, 'Beta');

        // No rounds recorded yet; manually set a non-zero value to prove overwrite.
        DB::table('game_team')->where('team_id', $teamAId)->where('game_id', $gameId)->update(['current_score' => 500]);

        $recomputed = $this->teamRepository->recomputeTeamScoreFromHistory($gameId, $teamAId);

        $this->assertSame(0, $recomputed);
        $this->assertDatabaseHas('game_team', ['team_id' => $teamAId, 'current_score' => 0]);
    }

    /**
     * Ensure the game summary API response reflects the persisted current_score for each team.
     *
     * @return void Verifies the summary endpoint returns current_score values that match the DB.
     */
    public function test_game_summary_returns_persisted_scores_for_teams(): void
    {
        $gameId = $this->createGameAndGetId(5000);
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 450],
                ['team_id' => $teamBId, 'points' => 300],
            ],
        ])->assertOk();

        $summary = $this->getJson("/api/v1/games/{$gameId}");

        $teams = collect($summary->json('data.game.teams'));

        $this->assertSame(450, $teams->firstWhere('id', $teamAId)['current_score']);
        $this->assertSame(300, $teams->firstWhere('id', $teamBId)['current_score']);
    }

    /**
     * Create a game and return its id for test setup.
     *
     * @param  int  $targetPoints  Winning threshold for the created game.
     * @return int Created game id.
     * Logic: use the games API to create a real persisted game so all downstream helpers work against the same DB row.
     */
    /**
     * Create a game and return its id for test setup.
     *
     * @param  int  $targetPoints  Winning threshold for the created game.
     * @return int Created game id.
     * Logic: authenticate as the shared test user and POST to the games endpoint;
     *   return the id from the response for subsequent test steps.
     */
    private function createGameAndGetId(int $targetPoints = 2000): int
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/games', [
            'name' => 'Score Test Game',
            'target_points' => $targetPoints,
        ]);

        return (int) $response->json('data.game.game.id');
    }

    /**
     * Add a team to a game and return its id for test setup.
     *
     * @param  int  $gameId  Identifier of the parent game.
     * @param  string  $name  Team name to register.
     * @return int Created team id.
     * Logic: use the teams API so the persisted team row matches production conditions.
     */
    private function addTeamAndGetId(int $gameId, string $name): int
    {
        $response = $this->postJson("/api/v1/games/{$gameId}/teams", [
            'name' => $name,
        ]);

        $teams = $response->json('data.game.teams');

        return (int) collect($teams)->firstWhere('name', $name)['id'];
    }

    /**
     * Ensure recording a round on a finished game is rejected with 422.
     *
     * @return void Verifies that rounds cannot be added to a finished game.
     * Logic: create a finished game with two teams, attempt to post a round, and assert an unprocessable response.
     */
    public function test_round_recording_rejected_for_finished_game(): void
    {
        $game = Game::query()->create([
            'name'                 => 'Finished Game',
            'target_points'        => 2000,
            'status'               => 'finished',
            'winning_team_id'      => null,
            'current_round_number' => 5,
        ]);

        $teamA = Team::query()->create(['name' => 'Alpha']);
        DB::table('game_team')->insert(['game_id' => $game->id, 'team_id' => $teamA->id, 'current_score' => 1200]);
        $teamB = Team::query()->create(['name' => 'Beta']);
        DB::table('game_team')->insert(['game_id' => $game->id, 'team_id' => $teamB->id, 'current_score' => 800]);

        $response = $this->postJson("/api/v1/games/{$game->id}/rounds", [
            'scores' => [
                ['team_id' => $teamA->id, 'points' => 300],
                ['team_id' => $teamB->id, 'points' => 200],
            ],
        ]);

        $response->assertUnprocessable();
    }

    /**
     * A QueryException inside DB::transaction logs an error and returns a 422 with a user-facing message.
     *
     * @return void Asserts Log::error('DB transaction failed in recordRound') fires and
     *   the response shape contains the round validation error message.
     * Logic: spy on the Log facade, partially mock the RoundRepository so only createRound throws a
     *   QueryException (leaving all other repository methods intact), POST a valid round payload,
     *   and assert the error log entry and 422 response shape.
     */
    public function test_db_transaction_failure_logs_error_and_returns_422(): void
    {
        $spy = Log::spy();

        $gameId  = $this->createGameAndGetId();
        $teamAId = $this->addTeamAndGetId($gameId, 'Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Beta');

        // Partially mock RoundRepository so only createRound throws a QueryException,
        // leaving all other repository methods (findGameOrFail, getTeamsForGame, etc.) intact.
        // A non-deadlock message is used intentionally: RefreshDatabase wraps the test in an
        // outer transaction (level 1), so DB::transaction() runs at level 2. When a deadlock
        // error is detected at level > 1, Laravel wraps it in DeadlockException (extends PDOException)
        // rather than re-throwing the QueryException — so the service catch block would never fire.
        // A generic SQL error propagates as the original QueryException and exercises the catch correctly.
        $this->partialMock(RoundRepository::class, function ($mock): void {
            $mock->shouldReceive('createRound')
                ->once()
                ->andThrow(new QueryException(
                    'mysql',
                    'INSERT INTO `rounds` ...',
                    [],
                    new \Exception('SQLSTATE[HY000]: General error: 1 no such table: rounds'),
                ));
        });

        $response = $this->actingAs($this->user)->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 100],
                ['team_id' => $teamBId, 'points' => 200],
            ],
        ]);

        $response->assertUnprocessable()
            ->assertJsonPath('data.errors.round.0', 'The round could not be saved due to a database error. Please try again.');

        $spy->shouldHaveReceived('error')->withArgs(function (string $message, array $context) use ($gameId): bool {
            return $message === 'DB transaction failed in recordRound'
                && ($context['game_id'] ?? null) === $gameId;
        });
    }
}
