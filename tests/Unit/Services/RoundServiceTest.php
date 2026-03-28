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
}
