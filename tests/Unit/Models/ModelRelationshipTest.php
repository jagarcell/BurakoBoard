<?php

namespace Tests\Unit\Models;

use App\Models\Game;
use App\Models\Player;
use App\Models\Round;
use App\Models\RoundScore;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelRelationshipTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Ensure a game loads the teams that belong to it.
     *
     * @return void Verifies the has-many game to teams relationship.
     * Logic: create teams under one game and assert only those related records are returned from the game model.
     */
    public function test_game_has_many_teams(): void
    {
        $game = Game::query()->create([
            'name' => 'League Night',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        Team::query()->create([
            'game_id' => $game->id,
            'name' => 'North',
            'current_score' => 0,
        ]);

        Team::query()->create([
            'game_id' => $game->id,
            'name' => 'South',
            'current_score' => 0,
        ]);

        $loadedGame = Game::query()->with('teams')->findOrFail($game->id);

        $this->assertCount(2, $loadedGame->teams);
        $this->assertSame(['North', 'South'], $loadedGame->teams->pluck('name')->all());
    }

    /**
     * Ensure a team resolves its parent game.
     *
     * @return void Verifies the inverse belongs-to team to game relationship.
     * Logic: create a team with a game_id and assert the related game can be loaded from the team model.
     */
    public function test_team_belongs_to_game(): void
    {
        $game = Game::query()->create([
            'name' => 'Saturday Match',
            'target_points' => 1500,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $team = Team::query()->create([
            'game_id' => $game->id,
            'name' => 'East',
            'current_score' => 0,
        ]);

        $this->assertSame($game->id, $team->game->id);
        $this->assertSame('Saturday Match', $team->game->name);
    }

    /**
     * Ensure a team loads players and those players resolve registered users.
     *
     * @return void Verifies team membership uses the player pivot and optional user ownership.
     * Logic: attach a player linked to a user onto a team and assert the team and player relations both resolve correctly.
     */
    public function test_team_membership_flows_through_players_to_users(): void
    {
        $user = User::factory()->create();

        $game = Game::query()->create([
            'name' => 'Club Finals',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $team = Team::query()->create([
            'game_id' => $game->id,
            'name' => 'West',
            'current_score' => 0,
        ]);

        $player = Player::query()->create([
            'user_id' => $user->id,
            'display_name' => $user->name,
        ]);

        $team->players()->attach($player->id);

        $loadedTeam = Team::query()->with('players.user')->findOrFail($team->id);
        $loadedPlayer = Player::query()->with(['teams', 'user'])->findOrFail($player->id);
        $loadedUser = User::query()->with('player')->findOrFail($user->id);

        $this->assertCount(1, $loadedTeam->players);
        $this->assertSame($player->id, $loadedTeam->players->first()->id);
        $this->assertSame($user->id, $loadedTeam->players->first()->user->id);
        $this->assertSame($team->id, $loadedPlayer->teams->first()->id);
        $this->assertSame($user->id, $loadedPlayer->user->id);
        $this->assertSame($player->id, $loadedUser->player->id);
    }

    /**
     * Ensure a game loads its rounds through the has-many relationship.
     *
     * @return void Verifies that rounds belonging to a game are reachable from the game model.
     * Logic: create two rounds under one game and assert the game loads them ordered by id.
     */
    public function test_game_has_many_rounds(): void
    {
        $game = Game::query()->create([
            'name' => 'Round Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        Round::query()->create(['game_id' => $game->id, 'round_number' => 1]);
        Round::query()->create(['game_id' => $game->id, 'round_number' => 2]);

        $loaded = Game::query()->with('rounds')->findOrFail($game->id);

        $this->assertCount(2, $loaded->rounds);
        $this->assertSame([1, 2], $loaded->rounds->pluck('round_number')->all());
    }

    /**
     * Ensure a round resolves its parent game.
     *
     * @return void Verifies the belongs-to round to game relationship.
     * Logic: create a round with a game_id and assert the parent game can be resolved from the round model.
     */
    public function test_round_belongs_to_game(): void
    {
        $game = Game::query()->create([
            'name' => 'Parent Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $round = Round::query()->create(['game_id' => $game->id, 'round_number' => 1]);

        $this->assertSame($game->id, $round->game->id);
        $this->assertSame('Parent Game', $round->game->name);
    }

    /**
     * Ensure a round loads its per-team score entries.
     *
     * @return void Verifies the has-many round to round_scores relationship.
     * Logic: create two score entries for one round and assert both are loaded through the relationship.
     */
    public function test_round_has_many_scores(): void
    {
        $game = Game::query()->create([
            'name' => 'Score Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $teamA = Team::query()->create(['game_id' => $game->id, 'name' => 'A', 'current_score' => 0]);
        $teamB = Team::query()->create(['game_id' => $game->id, 'name' => 'B', 'current_score' => 0]);
        $round = Round::query()->create(['game_id' => $game->id, 'round_number' => 1]);

        RoundScore::query()->create(['round_id' => $round->id, 'team_id' => $teamA->id, 'points' => 300]);
        RoundScore::query()->create(['round_id' => $round->id, 'team_id' => $teamB->id, 'points' => 200]);

        $loaded = Round::query()->with('scores')->findOrFail($round->id);

        $this->assertCount(2, $loaded->scores);
        $this->assertSame(
            [$teamA->id, $teamB->id],
            $loaded->scores->pluck('team_id')->all(),
        );
    }

    /**
     * Ensure a round-score entry resolves its parent round.
     *
     * @return void Verifies the belongs-to round_score to round relationship.
     * Logic: create a score entry and assert the parent round and its game can be resolved through the chain.
     */
    public function test_round_score_belongs_to_round(): void
    {
        $game = Game::query()->create([
            'name' => 'Chain Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $team = Team::query()->create(['game_id' => $game->id, 'name' => 'Solo', 'current_score' => 0]);
        $round = Round::query()->create(['game_id' => $game->id, 'round_number' => 1]);
        $score = RoundScore::query()->create(['round_id' => $round->id, 'team_id' => $team->id, 'points' => 150]);

        $loaded = RoundScore::query()->with('round.game')->findOrFail($score->id);

        $this->assertSame($round->id, $loaded->round->id);
        $this->assertSame($game->id, $loaded->round->game->id);
    }

    /**
     * Ensure a round-score entry resolves its owning team.
     *
     * @return void Verifies the belongs-to round_score to team relationship.
     * Logic: create a score entry and assert the owning team can be resolved from the score model.
     */
    public function test_round_score_belongs_to_team(): void
    {
        $game = Game::query()->create([
            'name' => 'Team Chain Game',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $team = Team::query()->create(['game_id' => $game->id, 'name' => 'Solo', 'current_score' => 0]);
        $round = Round::query()->create(['game_id' => $game->id, 'round_number' => 1]);
        $score = RoundScore::query()->create(['round_id' => $round->id, 'team_id' => $team->id, 'points' => 400]);

        $loaded = RoundScore::query()->with('team')->findOrFail($score->id);

        $this->assertSame($team->id, $loaded->team->id);
        $this->assertSame('Solo', $loaded->team->name);
    }

    /**
     * Ensure a team loads all its round-score entries.
     *
     * @return void Verifies the has-many team to round_scores relationship.
     * Logic: create two score entries across two rounds for one team and assert both are loaded through the relationship.
     */
    public function test_team_has_many_round_scores(): void
    {
        $game = Game::query()->create([
            'name' => 'Multi Round',
            'target_points' => 2000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $team = Team::query()->create(['game_id' => $game->id, 'name' => 'Scorers', 'current_score' => 0]);
        $other = Team::query()->create(['game_id' => $game->id, 'name' => 'Other', 'current_score' => 0]);

        $round1 = Round::query()->create(['game_id' => $game->id, 'round_number' => 1]);
        $round2 = Round::query()->create(['game_id' => $game->id, 'round_number' => 2]);

        RoundScore::query()->create(['round_id' => $round1->id, 'team_id' => $team->id, 'points' => 100]);
        RoundScore::query()->create(['round_id' => $round1->id, 'team_id' => $other->id, 'points' => 50]);
        RoundScore::query()->create(['round_id' => $round2->id, 'team_id' => $team->id, 'points' => 200]);
        RoundScore::query()->create(['round_id' => $round2->id, 'team_id' => $other->id, 'points' => 75]);

        $loaded = Team::query()->with('roundScores')->findOrFail($team->id);

        $this->assertCount(2, $loaded->roundScores);
        $this->assertSame([100, 200], $loaded->roundScores->pluck('points')->all());
    }

    /**
     * Ensure a team's score can be derived from round_scores summed through rounds scoped to the game.
     *
     * @return void Verifies that summing round_scores joined through rounds gives the correct game-scoped total.
     * Logic: create rounds and scores for two different games sharing the same team type and assert the sum is isolated per game.
     */
    public function test_team_score_derived_from_round_scores_is_scoped_to_game(): void
    {
        $gameA = Game::query()->create([
            'name' => 'Game A',
            'target_points' => 5000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $gameB = Game::query()->create([
            'name' => 'Game B',
            'target_points' => 5000,
            'status' => 'in_progress',
            'winning_team_id' => null,
            'current_round_number' => 0,
        ]);

        $teamA = Team::query()->create(['game_id' => $gameA->id, 'name' => 'Alpha', 'current_score' => 0]);
        $teamB = Team::query()->create(['game_id' => $gameB->id, 'name' => 'Alpha', 'current_score' => 0]);

        $roundA = Round::query()->create(['game_id' => $gameA->id, 'round_number' => 1]);
        $roundB = Round::query()->create(['game_id' => $gameB->id, 'round_number' => 1]);

        // Dummy second teams so rounds have the required ≥2 team coverage.
        $filler1 = Team::query()->create(['game_id' => $gameA->id, 'name' => 'Filler1', 'current_score' => 0]);
        $filler2 = Team::query()->create(['game_id' => $gameB->id, 'name' => 'Filler2', 'current_score' => 0]);

        RoundScore::query()->create(['round_id' => $roundA->id, 'team_id' => $teamA->id, 'points' => 600]);
        RoundScore::query()->create(['round_id' => $roundA->id, 'team_id' => $filler1->id, 'points' => 100]);
        RoundScore::query()->create(['round_id' => $roundB->id, 'team_id' => $teamB->id, 'points' => 900]);
        RoundScore::query()->create(['round_id' => $roundB->id, 'team_id' => $filler2->id, 'points' => 200]);

        // Score for teamA (game A) must be 600, not 600+900.
        $scoreA = $teamA->roundScores()
            ->join('rounds', 'rounds.id', '=', 'round_scores.round_id')
            ->where('rounds.game_id', $teamA->game_id)
            ->sum('round_scores.points');

        // Score for teamB (game B) must be 900, not 600+900.
        $scoreB = $teamB->roundScores()
            ->join('rounds', 'rounds.id', '=', 'round_scores.round_id')
            ->where('rounds.game_id', $teamB->game_id)
            ->sum('round_scores.points');

        $this->assertSame(600, (int) $scoreA);
        $this->assertSame(900, (int) $scoreB);
    }
}
