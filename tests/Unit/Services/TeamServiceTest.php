<?php

namespace Tests\Unit\Services;

use App\Enums\GameStatus;
use App\Events\GameUpdated;
use App\Models\Game;
use App\Models\Team;
use App\Repositories\GameRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use App\Services\TeamService;
use Illuminate\Validation\ValidationException;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class TeamServiceTest extends TestCase
{
    private GameRepository&MockInterface $gameRepository;
    private TeamRepository&MockInterface $teamRepository;
    private SeatRepository&MockInterface $seatRepository;
    private TeamService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->gameRepository = Mockery::mock(GameRepository::class);
        $this->teamRepository = Mockery::mock(TeamRepository::class);
        $this->seatRepository = Mockery::mock(SeatRepository::class);

        $this->service = new TeamService(
            $this->gameRepository,
            $this->teamRepository,
            $this->seatRepository,
        );
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

        $summary = ['id' => 1, 'teams' => []];

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

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summary);

        $result = $this->service->addTeam(1, ['name' => 'Alpha']);

        $this->assertSame($summary, $result);
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

        $summary = ['id' => 1];

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

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summary);

        $result = $this->service->attachExistingTeam(1, 3);

        $this->assertSame($summary, $result);
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

        $summary = ['id' => 1];

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

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summary);

        $result = $this->service->updateTeam(1, 2, ['name' => 'New']);

        $this->assertSame($summary, $result);
    }
}
