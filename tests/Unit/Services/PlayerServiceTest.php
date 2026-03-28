<?php

namespace Tests\Unit\Services;

use App\Data\GameSummaryData;
use App\Enums\GameStatus;
use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Repositories\GameRepository;
use App\Repositories\PlayerRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use App\Services\PlayerService;
use Illuminate\Validation\ValidationException;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class PlayerServiceTest extends TestCase
{
    private GameRepository&MockInterface $gameRepository;
    private TeamRepository&MockInterface $teamRepository;
    private PlayerRepository&MockInterface $playerRepository;
    private SeatRepository&MockInterface $seatRepository;
    private PlayerService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->gameRepository   = Mockery::mock(GameRepository::class);
        $this->teamRepository   = Mockery::mock(TeamRepository::class);
        $this->playerRepository = Mockery::mock(PlayerRepository::class);
        $this->seatRepository   = Mockery::mock(SeatRepository::class);

        $this->service = new PlayerService(
            $this->gameRepository,
            $this->teamRepository,
            $this->playerRepository,
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

    public function test_list_users_delegates_to_repository(): void
    {
        $this->playerRepository->shouldReceive('getUserList')
            ->once()
            ->andReturn(collect([['id' => 1, 'name' => 'Alice']]));

        $result = $this->service->listUsers();

        $this->assertCount(1, $result);
    }

    public function test_add_player_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->addPlayerToTeam(1, 2, ['name' => 'Alice']);
    }

    public function test_add_player_throws_on_duplicate_name(): void
    {
        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $team     = new Team(['id' => 2]);
        $team->id = 2;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($team);

        $this->playerRepository->shouldReceive('teamHasPlayerWithName')
            ->once()
            ->with(2, 'Alice')
            ->andReturn(true);

        $this->expectException(ValidationException::class);

        $this->service->addPlayerToTeam(1, 2, ['name' => 'Alice']);
    }

    public function test_add_player_creates_named_player_and_assigns_seat(): void
    {

        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $team     = new Team(['id' => 2]);
        $team->id = 2;

        $player     = new Player(['id' => 10]);
        $player->id = 10;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($team);

        $this->playerRepository->shouldReceive('teamHasPlayerWithName')
            ->once()
            ->with(2, 'Alice')
            ->andReturn(false);

        $this->playerRepository->shouldReceive('createNamedPlayer')
            ->once()
            ->with('Alice')
            ->andReturn($player);

        $this->playerRepository->shouldReceive('attachPlayerToTeam')
            ->once()
            ->with(2, 10);

        $this->seatRepository->shouldReceive('assignPlayerSeat')
            ->once()
            ->with(1, 2, 10);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->addPlayerToTeam(1, 2, ['name' => 'Alice']);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    public function test_add_player_resolves_registered_user_by_user_id(): void
    {

        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $team     = new Team(['id' => 2]);
        $team->id = 2;

        $player     = new Player(['id' => 10]);
        $player->id = 10;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($team);

        // name is provided alongside user_id so duplicate check still runs
        $this->playerRepository->shouldReceive('teamHasPlayerWithName')
            ->once()
            ->with(2, 'Bob')
            ->andReturn(false);

        $this->playerRepository->shouldReceive('findOrCreatePlayerFromUser')
            ->once()
            ->with(7, 'Bob')
            ->andReturn($player);

        $this->playerRepository->shouldReceive('attachPlayerToTeam')
            ->once()
            ->with(2, 10);

        $this->seatRepository->shouldReceive('assignPlayerSeat')
            ->once()
            ->with(1, 2, 10);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $this->service->addPlayerToTeam(1, 2, ['user_id' => 7, 'name' => 'Bob']);
    }

    public function test_remove_player_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->removePlayerFromTeam(1, 2, 3);
    }

    public function test_remove_player_detaches_seat_and_pivot(): void
    {

        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $team     = new Team(['id' => 2]);
        $team->id = 2;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($team);

        $this->seatRepository->shouldReceive('removePlayerSeatForTeam')
            ->once()
            ->with(2, 3);

        $this->playerRepository->shouldReceive('detachPlayerFromTeam')
            ->once()
            ->with(2, 3);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->removePlayerFromTeam(1, 2, 3);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    public function test_swap_player_seats_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->swapPlayerSeats(1, 2, 3);
    }

    public function test_swap_player_seats_delegates_to_repository(): void
    {

        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->seatRepository->shouldReceive('swapPlayerSeats')
            ->once()
            ->with(1, 2, 3);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->swapPlayerSeats(1, 2, 3);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }
}
