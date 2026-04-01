<?php

namespace Tests\Unit\Services;

use App\Data\GameSummaryData;
use App\Enums\GameStatus;
use App\Events\GameUpdated;
use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Repositories\GameRepository;
use App\Repositories\PlayerRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use App\Services\TeamService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class TeamServiceTest extends TestCase
{
    private GameRepository&MockInterface $gameRepository;
    private TeamRepository&MockInterface $teamRepository;
    private SeatRepository&MockInterface $seatRepository;
    private PlayerRepository&MockInterface $playerRepository;
    private TeamService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->gameRepository   = Mockery::mock(GameRepository::class);
        $this->teamRepository   = Mockery::mock(TeamRepository::class);
        $this->seatRepository   = Mockery::mock(SeatRepository::class);
        $this->playerRepository = Mockery::mock(PlayerRepository::class);

        $this->service = new TeamService(
            $this->gameRepository,
            $this->teamRepository,
            $this->seatRepository,
            $this->playerRepository,
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

    public function test_list_teams_delegates_to_repository(): void
    {
        $this->teamRepository->shouldReceive('getAllTeams')
            ->once()
            ->andReturn(collect([['id' => 1, 'name' => 'Alpha']]));

        $result = $this->service->listTeams();

        $this->assertCount(1, $result);
    }

    public function test_add_team_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->addTeam(1, ['name' => 'Alpha']);
    }

    public function test_add_team_creates_team_and_broadcasts(): void
    {

        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $team     = new Team(['id' => 5, 'name' => 'Alpha']);
        $team->id = 5;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('createTeam')
            ->once()
            ->with(['name' => 'Alpha'])
            ->andReturn($team);

        $this->teamRepository->shouldReceive('attachTeamToGame')
            ->once()
            ->with(1, 5);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->addTeam(1, ['name' => 'Alpha']);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    public function test_attach_existing_team_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->attachExistingTeam(1, 3);
    }

    public function test_attach_existing_team_throws_when_already_attached(): void
    {
        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $team     = new Team(['id' => 3]);
        $team->id = 3;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('findTeamOrFail')
            ->once()
            ->with(3)
            ->andReturn($team);

        $this->teamRepository->shouldReceive('isTeamAttachedToGame')
            ->once()
            ->with(1, 3)
            ->andReturn(true);

        $this->expectException(ValidationException::class);

        $this->service->attachExistingTeam(1, 3);
    }

    public function test_attach_existing_team_inserts_pivot_and_reassigns_seats(): void
    {

        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $team     = new Team(['id' => 3]);
        $team->id = 3;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('findTeamOrFail')
            ->once()
            ->with(3)
            ->andReturn($team);

        $this->teamRepository->shouldReceive('isTeamAttachedToGame')
            ->once()
            ->with(1, 3)
            ->andReturn(false);

        $this->teamRepository->shouldReceive('attachTeamToGame')
            ->once()
            ->with(1, 3);

        $this->seatRepository->shouldReceive('reassignAllSeatsForGame')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->attachExistingTeam(1, 3);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    public function test_update_team_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->updateTeam(1, 2, ['name' => 'New']);
    }

    public function test_update_team_delegates_to_repository_and_broadcasts(): void
    {

        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $team     = new Team(['id' => 2, 'name' => 'Old']);
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

        $this->teamRepository->shouldReceive('updateTeam')
            ->once()
            ->with($team, ['name' => 'New']);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->updateTeam(1, 2, ['name' => 'New']);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    public function test_batch_update_team_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->batchUpdateTeam(1, 2, [
            'name'              => 'Alpha',
            'remove_player_ids' => [],
            'add_players'       => [],
            'seat_swaps'        => [],
        ]);
    }

    public function test_batch_update_team_applies_all_changes_in_transaction_and_broadcasts(): void
    {
        $game         = new Game();
        $game->status = GameStatus::InProgress;

        $team     = new Team(['id' => 2, 'name' => 'Old']);
        $team->id = 2;

        $newPlayer     = new Player(['id' => 99, 'name' => 'Charlie']);
        $newPlayer->id = 99;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('findTeamInGameOrFail')
            ->once()
            ->with(1, 2)
            ->andReturn($team);

        DB::shouldReceive('transaction')
            ->once()
            ->andReturnUsing(fn ($cb) => $cb());

        // a. Rename
        $this->teamRepository->shouldReceive('updateTeam')
            ->once()
            ->with($team, ['name' => 'New Name']);

        // b. Remove player 55
        $this->seatRepository->shouldReceive('removePlayerSeatForTeam')
            ->once()
            ->with(2, 55);

        $this->playerRepository->shouldReceive('detachPlayerFromTeam')
            ->once()
            ->with(2, 55);

        // c. Add player 'Charlie' (name-only, no user_id)
        $this->playerRepository->shouldReceive('teamHasPlayerWithName')
            ->once()
            ->with(2, 'Charlie')
            ->andReturn(false);

        $this->playerRepository->shouldReceive('createNamedPlayer')
            ->once()
            ->with('Charlie')
            ->andReturn($newPlayer);

        $this->playerRepository->shouldReceive('attachPlayerToTeam')
            ->once()
            ->with(2, 99);

        $this->seatRepository->shouldReceive('assignPlayerSeat')
            ->once()
            ->with(1, 2, 99);

        // d. Seat swap
        $this->seatRepository->shouldReceive('swapPlayerSeats')
            ->once()
            ->with(1, 10, 20);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $result = $this->service->batchUpdateTeam(1, 2, [
            'name'              => 'New Name',
            'remove_player_ids' => [55],
            'add_players'       => [['name' => 'Charlie']],
            'seat_swaps'        => [['player_id_a' => 10, 'player_id_b' => 20]],
        ]);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }
}
