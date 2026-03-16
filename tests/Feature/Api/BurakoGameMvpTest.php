<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BurakoGameMvpTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Ensure a game can be created with name and target points.
     *
     * @return void Verifies game creation endpoint and initial state.
     */
    public function test_can_create_a_game(): void
    {
        $response = $this->postJson('/api/v1/games', [
            'name' => 'Friday Burako',
            'target_points' => 2000,
        ]);

        $response
            ->assertStatus(201)
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.game.name', 'Friday Burako')
            ->assertJsonPath('data.game.game.target_points', 2000)
            ->assertJsonPath('data.game.game.status', 'in_progress')
            ->assertJsonPath('data.game.game.current_round_number', 0);
    }

    /**
     * Ensure teams and players can be assigned to a game using both player modes.
     *
     * @return void Verifies team creation and player assignment by name or user id.
     */
    public function test_can_add_teams_and_players_by_name_or_registered_user(): void
    {
        $gameId = $this->createGameAndGetId();

        $teamAId = $this->addTeamAndGetId($gameId, 'Team Alpha');
        $teamBId = $this->addTeamAndGetId($gameId, 'Team Beta');

        $namedPlayerResponse = $this->postJson("/api/v1/games/{$gameId}/teams/{$teamAId}/players", [
            'name' => 'Carlos',
        ]);

        $user = User::factory()->create();

        $registeredPlayerResponse = $this->postJson("/api/v1/games/{$gameId}/teams/{$teamBId}/players", [
            'user_id' => $user->id,
            'name' => $user->name,
        ]);

        $namedPlayerResponse
            ->assertStatus(201)
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.teams.0.players.0.display_name', 'Carlos');

        $registeredPlayerResponse
            ->assertStatus(201)
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.teams.1.players.0.user_id', $user->id);
    }

    /**
     * Ensure round recording updates running score and closes the game on winner.
     *
     * @return void Verifies round persistence, cumulative scores, and winner selection.
     */
    public function test_recording_rounds_updates_scores_and_marks_winner(): void
    {
        $gameId = $this->createGameAndGetId(1500);

        $teamAId = $this->addTeamAndGetId($gameId, 'Team A');
        $teamBId = $this->addTeamAndGetId($gameId, 'Team B');

        $roundOne = $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 800],
                ['team_id' => $teamBId, 'points' => 500],
            ],
        ]);

        $roundOne
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.game.current_round_number', 1)
            ->assertJsonPath('data.game.game.status', 'in_progress');

        $this->assertDatabaseHas('game_team', ['team_id' => $teamAId, 'current_score' => 800]);
        $this->assertDatabaseHas('game_team', ['team_id' => $teamBId, 'current_score' => 500]);

        $roundTwo = $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 900],
                ['team_id' => $teamBId, 'points' => 600],
            ],
        ]);

        $roundTwo
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.game.status', 'finished')
            ->assertJsonPath('data.game.game.winning_team_id', $teamAId)
            ->assertJsonPath('data.game.game.current_round_number', 2)
            ->assertJsonCount(2, 'data.game.rounds');

        $this->assertDatabaseHas('game_team', ['team_id' => $teamAId, 'current_score' => 1700]);
        $this->assertDatabaseHas('game_team', ['team_id' => $teamBId, 'current_score' => 1100]);
    }

    /**
     * Ensure game summary returns historical round scoring by team.
     *
     * @return void Verifies scoreboard history endpoint data shape.
     */
    public function test_game_summary_returns_round_history(): void
    {
        $gameId = $this->createGameAndGetId();

        $teamAId = $this->addTeamAndGetId($gameId, 'North');
        $teamBId = $this->addTeamAndGetId($gameId, 'South');

        $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 300],
                ['team_id' => $teamBId, 'points' => 200],
            ],
        ])->assertOk();

        $summary = $this->getJson("/api/v1/games/{$gameId}");

        $summary
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game.rounds.0.round_number', 1)
            ->assertJsonPath('data.game.rounds.0.scores.0.team_id', $teamAId)
            ->assertJsonPath('data.game.rounds.0.scores.1.team_id', $teamBId);
    }

    /**
     * Ensure each round payload includes every game team exactly once.
     *
     * @return void Verifies validation guard against partial round submissions.
     */
    public function test_round_requires_all_teams_to_be_scored_once(): void
    {
        $gameId = $this->createGameAndGetId();

        $teamAId = $this->addTeamAndGetId($gameId, 'One');
        $this->addTeamAndGetId($gameId, 'Two');

        $response = $this->postJson("/api/v1/games/{$gameId}/rounds", [
            'scores' => [
                ['team_id' => $teamAId, 'points' => 450],
            ],
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonPath('status', 'error')
            ->assertJsonStructure([
                'data' => ['message', 'errors'],
            ]);
    }

    /**
     * Create a game and return its id for test setup.
     *
     * @param  int  $targetPoints  Winning threshold for the created game.
     * @return int Created game id.
     */
    private function createGameAndGetId(int $targetPoints = 2000): int
    {
        $response = $this->postJson('/api/v1/games', [
            'name' => 'MVP Game',
            'target_points' => $targetPoints,
        ]);

        return (int) $response->json('data.game.game.id');
    }

    /**
     * Add a team and return its id for test setup.
     *
     * @param  int  $gameId  Identifier of the parent game.
     * @param  string  $name  Team name to create.
     * @return int Created team id.
     */
    private function addTeamAndGetId(int $gameId, string $name): int
    {
        $response = $this->postJson("/api/v1/games/{$gameId}/teams", [
            'name' => $name,
        ]);

        $teams = $response->json('data.game.teams');

        return (int) collect($teams)->firstWhere('name', $name)['id'];
    }
}
