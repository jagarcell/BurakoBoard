<?php

namespace Tests\Unit\Services;

use App\Data\GameSummaryData;
use App\Enums\GameStatus;
use App\Models\Game;
use App\Repositories\GameRepository;
use App\Repositories\RoundDraftRepository;
use App\Repositories\RoundRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use App\Services\RoundService;
use App\Models\Round;
use App\Models\Team;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class RoundServiceTest extends TestCase
{
    private GameRepository&MockInterface $gameRepository;
    private TeamRepository&MockInterface $teamRepository;
    private RoundRepository&MockInterface $roundRepository;
    private RoundDraftRepository&MockInterface $roundDraftRepository;
    private SeatRepository&MockInterface $seatRepository;
    private RoundService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->gameRepository       = Mockery::mock(GameRepository::class);
        $this->teamRepository       = Mockery::mock(TeamRepository::class);
        $this->roundRepository      = Mockery::mock(RoundRepository::class);
        $this->roundDraftRepository = Mockery::mock(RoundDraftRepository::class);
        $this->seatRepository       = Mockery::mock(SeatRepository::class);

        $this->service = new RoundService(
            $this->gameRepository,
            $this->teamRepository,
            $this->roundRepository,
            $this->roundDraftRepository,
            $this->seatRepository,
        );
    }

    private function makeGameSummaryData(int $id = 1): GameSummaryData
    {
        $game = new Game([
            'name'                         => 'Test Game',
            'target_points'                => 2000,
            'status'                       => GameStatus::InProgress,
            'winning_team_id'              => null,
            'current_round_number'         => 0,
            'initial_shuffler_seat_number' => null,
        ]);
        $game->id = $id;
        return new GameSummaryData($game, collect(), collect(), collect());
    }

    public function test_set_initial_shuffler_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->setInitialShuffler(1, 5);
    }

    public function test_set_initial_shuffler_throws_when_rounds_already_played(): void
    {
        $game                        = new Game();
        $game->status                = GameStatus::InProgress;
        $game->current_round_number  = 1;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->setInitialShuffler(1, 5);
    }

    public function test_set_initial_shuffler_throws_when_player_not_seated(): void
    {
        $game                        = new Game();
        $game->status                = GameStatus::InProgress;
        $game->current_round_number  = 0;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->seatRepository->shouldReceive('findSeatedPlayerInGame')
            ->once()
            ->with(1, 5)
            ->andReturn(null);

        $this->expectException(ValidationException::class);

        $this->service->setInitialShuffler(1, 5);
    }

    public function test_set_initial_shuffler_persists_seat_and_broadcasts(): void
    {

        $game                        = new Game();
        $game->status                = GameStatus::InProgress;
        $game->current_round_number  = 0;

        $seatedPlayer              = new \stdClass();
        $seatedPlayer->seat_number = 3;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->seatRepository->shouldReceive('findSeatedPlayerInGame')
            ->once()
            ->with(1, 5)
            ->andReturn($seatedPlayer);

        $this->gameRepository->shouldReceive('updateGameInitialShufflerSeat')
            ->once()
            ->with($game, 3);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->setInitialShuffler(1, 5);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    public function test_record_round_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->recordRound(1, ['scores' => []]);
    }

    public function test_record_round_throws_when_fewer_than_two_teams(): void
    {
        $game                = new Game();
        $game->status        = GameStatus::InProgress;
        $game->target_points = 2000;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('getTeamsForGame')
            ->once()
            ->with(1)
            ->andReturn(collect([['id' => 1]]));

        $this->expectException(ValidationException::class);

        $this->service->recordRound(1, ['scores' => [['team_id' => 1, 'points' => 100]]]);
    }

    public function test_sync_game_scores_delegates_to_team_repository(): void
    {
        $this->teamRepository->shouldReceive('syncTeamScoresForGame')
            ->once()
            ->with(7);

        $this->service->syncGameScores(7);
    }

    public function test_record_round_throws_when_scores_do_not_cover_all_teams(): void
    {
        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('getTeamsForGame')
            ->once()
            ->with(1)
            ->andReturn(collect([['id' => 1], ['id' => 2]]));

        $this->expectException(ValidationException::class);

        // Scores cover teams 1 and 3, but game has teams 1 and 2
        $this->service->recordRound(1, [
            'scores' => [
                ['team_id' => 1, 'points' => 100],
                ['team_id' => 3, 'points' => 200],
            ],
        ]);
    }

    public function test_record_round_marks_game_finished_when_score_reaches_target(): void
    {
        $game                = new Game();
        $game->status        = GameStatus::InProgress;
        $game->target_points = 500;

        $round               = new Round();
        $round->id           = 10;
        $round->round_number = 1;

        $team1Model     = new Team();
        $team1Model->id = 1;

        $team2Model     = new Team();
        $team2Model->id = 2;

        $updatedTeam1                = new \stdClass();
        $updatedTeam1->id            = 1;
        $updatedTeam1->current_score = 600;

        $updatedTeam2                = new \stdClass();
        $updatedTeam2->id            = 2;
        $updatedTeam2->current_score = 200;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('getTeamsForGame')
            ->once()
            ->with(1)
            ->andReturn(collect([['id' => 1], ['id' => 2]]));

        DB::shouldReceive('transaction')
            ->once()
            ->andReturnUsing(fn ($cb) => $cb());

        $this->roundRepository->shouldReceive('getNextRoundNumber')
            ->once()
            ->with(1)
            ->andReturn(1);

        $this->roundRepository->shouldReceive('createRound')
            ->once()
            ->with(1, 1)
            ->andReturn($round);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 1)
            ->andReturn($team1Model);

        $this->roundRepository->shouldReceive('createRoundScore')
            ->once()
            ->with(10, 1, 600);

        $this->teamRepository->shouldReceive('incrementTeamScore')
            ->once()
            ->with(1, 1, 600)
            ->andReturn($updatedTeam1);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($team2Model);

        $this->roundRepository->shouldReceive('createRoundScore')
            ->once()
            ->with(10, 2, 200);

        $this->teamRepository->shouldReceive('incrementTeamScore')
            ->once()
            ->with(1, 2, 200)
            ->andReturn($updatedTeam2);

        // Team 1 reached target (600 >= 500); game is finished with team 1 as winner
        $this->gameRepository->shouldReceive('finishGameWithWinner')
            ->once()
            ->with($game, 1, 1);

        $this->roundDraftRepository->shouldReceive('archiveRoundDraft')
            ->once()
            ->with(1, 1);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->recordRound(1, [
            'scores' => [
                ['team_id' => 1, 'points' => 600],
                ['team_id' => 2, 'points' => 200],
            ],
        ]);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    public function test_record_round_increments_round_counter_when_no_winner(): void
    {
        $game                = new Game();
        $game->status        = GameStatus::InProgress;
        $game->target_points = 2000;

        $round               = new Round();
        $round->id           = 11;
        $round->round_number = 2;

        $team1Model     = new Team();
        $team1Model->id = 1;

        $team2Model     = new Team();
        $team2Model->id = 2;

        $updatedTeam1                = new \stdClass();
        $updatedTeam1->id            = 1;
        $updatedTeam1->current_score = 300;

        $updatedTeam2                = new \stdClass();
        $updatedTeam2->id            = 2;
        $updatedTeam2->current_score = 200;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('getTeamsForGame')
            ->once()
            ->with(1)
            ->andReturn(collect([['id' => 1], ['id' => 2]]));

        DB::shouldReceive('transaction')
            ->once()
            ->andReturnUsing(fn ($cb) => $cb());

        $this->roundRepository->shouldReceive('getNextRoundNumber')
            ->once()
            ->with(1)
            ->andReturn(2);

        $this->roundRepository->shouldReceive('createRound')
            ->once()
            ->with(1, 2)
            ->andReturn($round);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 1)
            ->andReturn($team1Model);

        $this->roundRepository->shouldReceive('createRoundScore')
            ->once()
            ->with(11, 1, 300);

        $this->teamRepository->shouldReceive('incrementTeamScore')
            ->once()
            ->with(1, 1, 300)
            ->andReturn($updatedTeam1);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($team2Model);

        $this->roundRepository->shouldReceive('createRoundScore')
            ->once()
            ->with(11, 2, 200);

        $this->teamRepository->shouldReceive('incrementTeamScore')
            ->once()
            ->with(1, 2, 200)
            ->andReturn($updatedTeam2);

        // Neither team reached target (2000); counter is incremented instead
        $this->gameRepository->shouldReceive('updateGameRoundCounter')
            ->once()
            ->with($game, 2);

        $this->roundDraftRepository->shouldReceive('archiveRoundDraft')
            ->once()
            ->with(1, 2);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->recordRound(1, [
            'scores' => [
                ['team_id' => 1, 'points' => 300],
                ['team_id' => 2, 'points' => 200],
            ],
        ]);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    public function test_amend_round_updates_scores_syncs_totals_and_finishes_game_when_target_reached(): void
    {
        $game                = new Game();
        $game->status        = GameStatus::InProgress;
        $game->target_points = 500;

        $round               = new Round();
        $round->id           = 21;
        $round->round_number = 1;

        $team1Model     = new Team();
        $team1Model->id = 1;

        $team2Model     = new Team();
        $team2Model->id = 2;

        $updatedTeam1                = new \stdClass();
        $updatedTeam1->id            = 1;
        $updatedTeam1->current_score = 600;

        $updatedTeam2                = new \stdClass();
        $updatedTeam2->id            = 2;
        $updatedTeam2->current_score = 300;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, Mockery::type('int'))
            ->andReturn(true);

        $this->teamRepository->shouldReceive('getTeamsForGame')
            ->once()
            ->with(1)
            ->andReturn(collect([['id' => 1], ['id' => 2]]));

        DB::shouldReceive('transaction')
            ->once()
            ->andReturnUsing(fn ($cb) => $cb());

        $this->roundRepository->shouldReceive('findRoundInGameOrFail')
            ->once()
            ->with(1, 1)
            ->andReturn($round);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 1)
            ->andReturn($team1Model);

        $this->roundRepository->shouldReceive('upsertRoundScore')
            ->once()
            ->with(21, 1, 600);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($team2Model);

        $this->roundRepository->shouldReceive('upsertRoundScore')
            ->once()
            ->with(21, 2, 300);

        $this->roundDraftRepository->shouldReceive('upsertArchivedRoundDraft')
            ->once()
            ->with(1, 1, ['1' => [1 => true]], ['1' => ['cardsInHand' => 3, 'cardsOnTable' => 0]]);

        $this->teamRepository->shouldReceive('syncTeamScoresForGame')
            ->once()
            ->with(1);

        $this->teamRepository->shouldReceive('getTeamsForGame')
            ->once()
            ->with(1)
            ->andReturn(collect([$updatedTeam1, $updatedTeam2]));

        $this->roundRepository->shouldReceive('getMaxRoundNumberForGame')
            ->once()
            ->with(1)
            ->andReturn(4);

        $this->gameRepository->shouldReceive('reconcileGameOutcome')
            ->once()
            ->with($game, 1, 4);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->amendRound(1, 1, [
            'scores' => [
                ['team_id' => 1, 'points' => 600],
                ['team_id' => 2, 'points' => 300],
            ],
            'base_inputs' => ['1' => [1 => true]],
            'card_inputs' => ['1' => ['cardsInHand' => 3, 'cardsOnTable' => 0]],
        ]);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    public function test_amend_round_reopens_game_when_no_team_reaches_target_after_resync(): void
    {
        $game                = new Game();
        $game->status        = GameStatus::Finished;
        $game->target_points = 2000;

        $round               = new Round();
        $round->id           = 33;
        $round->round_number = 2;

        $team1Model     = new Team();
        $team1Model->id = 1;

        $team2Model     = new Team();
        $team2Model->id = 2;

        $updatedTeam1                = new \stdClass();
        $updatedTeam1->id            = 1;
        $updatedTeam1->current_score = 1800;

        $updatedTeam2                = new \stdClass();
        $updatedTeam2->id            = 2;
        $updatedTeam2->current_score = 1500;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, Mockery::type('int'))
            ->andReturn(true);

        $this->teamRepository->shouldReceive('getTeamsForGame')
            ->once()
            ->with(1)
            ->andReturn(collect([['id' => 1], ['id' => 2]]));

        DB::shouldReceive('transaction')
            ->once()
            ->andReturnUsing(fn ($cb) => $cb());

        $this->roundRepository->shouldReceive('findRoundInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($round);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 1)
            ->andReturn($team1Model);

        $this->roundRepository->shouldReceive('upsertRoundScore')
            ->once()
            ->with(33, 1, 100);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($team2Model);

        $this->roundRepository->shouldReceive('upsertRoundScore')
            ->once()
            ->with(33, 2, 150);

        $this->roundDraftRepository->shouldReceive('upsertArchivedRoundDraft')
            ->once()
            ->with(1, 2, [], []);

        $this->teamRepository->shouldReceive('syncTeamScoresForGame')
            ->once()
            ->with(1);

        $this->teamRepository->shouldReceive('getTeamsForGame')
            ->once()
            ->with(1)
            ->andReturn(collect([$updatedTeam1, $updatedTeam2]));

        $this->roundRepository->shouldReceive('getMaxRoundNumberForGame')
            ->once()
            ->with(1)
            ->andReturn(7);

        $this->gameRepository->shouldReceive('reconcileGameOutcome')
            ->once()
            ->with($game, null, 7);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->amendRound(1, 2, [
            'scores' => [
                ['team_id' => 1, 'points' => 100],
                ['team_id' => 2, 'points' => 150],
            ],
        ]);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
    }
}
