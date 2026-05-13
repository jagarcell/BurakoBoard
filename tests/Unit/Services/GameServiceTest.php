<?php

namespace Tests\Unit\Services;

use App\Data\GameSummaryData;
use App\Enums\GameStatus;
use App\Enums\GameUserRole;
use App\Events\GameRoleUpdated;
use App\Events\GameUpdated;
use App\Models\Game;
use App\Models\User;
use App\Repositories\GameRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use App\Services\GameService;
use App\Services\InvitationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Validation\ValidationException;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class GameServiceTest extends TestCase
{
    private GameRepository&MockInterface $gameRepository;
    private TeamRepository&MockInterface $teamRepository;
    private SeatRepository&MockInterface $seatRepository;
    private InvitationService&MockInterface $invitationService;
    private GameService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->gameRepository    = Mockery::mock(GameRepository::class);
        $this->teamRepository    = Mockery::mock(TeamRepository::class);
        $this->seatRepository    = Mockery::mock(SeatRepository::class);
        $this->invitationService = Mockery::mock(InvitationService::class);

        $this->service = new GameService(
            $this->gameRepository,
            $this->teamRepository,
            $this->seatRepository,
            $this->invitationService,
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

    public function test_list_games_delegates_to_repository(): void
    {
        $this->gameRepository->shouldReceive('getGameList')
            ->once()
            ->with(42)
            ->andReturn(collect([['id' => 1]]));

        $result = $this->service->listGames(42);

        $this->assertCount(1, $result);
    }

    public function test_create_game_persists_and_attaches_creator(): void
    {
        $game     = new Game(['id' => 10]);
        $game->id = 10;
        $summaryData = $this->makeGameSummaryData(10);

        $this->gameRepository->shouldReceive('createGame')
            ->once()
            ->andReturn($game);

        $this->gameRepository->shouldReceive('attachUserToGame')
            ->once()
            ->with(10, 5, GameUserRole::Creator->value);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(10)
            ->andReturn($summaryData);

        $result = $this->service->createGame(['name' => 'Alpha', 'target_points' => 2000], 5);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
        $this->assertArrayHasKey('rounds', $result);
        $this->assertArrayHasKey('round_roles', $result);
    }

    public function test_update_game_delegates_to_repository(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('updateGame')
            ->once()
            ->with(7, ['name' => 'Beta', 'target_points' => 3000])
            ->andReturn($game);

        $result = $this->service->updateGame(7, ['name' => 'Beta', 'target_points' => 3000]);

        $this->assertSame($game, $result);
    }

    public function test_list_base_elements_delegates_to_repository(): void
    {
        $this->gameRepository->shouldReceive('getBaseElements')
            ->once()
            ->andReturn(collect([]));

        $result = $this->service->listBaseElements();

        $this->assertInstanceOf(\Illuminate\Support\Collection::class, $result);
    }

    public function test_get_game_summary_delegates_to_repository(): void
    {
        $summaryData = $this->makeGameSummaryData(2);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(2)
            ->andReturn($summaryData);

        $result = $this->service->getGameSummary(2);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
        $this->assertArrayHasKey('rounds', $result);
        $this->assertArrayHasKey('round_roles', $result);
    }

    public function test_game_has_two_teams_returns_true_when_teams_present(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(3)
            ->andReturn($game);

        $this->teamRepository->shouldReceive('gameHasTwoTeams')
            ->once()
            ->with(3)
            ->andReturn(true);

        $this->assertTrue($this->service->gameHasTwoTeams(3));
    }

    public function test_delete_game_aborts_when_not_creator(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 99)
            ->andReturn(false);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);

        $this->service->deleteGame(1, 99);
    }

    public function test_delete_game_throws_when_rounds_exist(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 5)
            ->andReturn(true);

        $this->gameRepository->shouldReceive('gameHasRounds')
            ->once()
            ->with(1)
            ->andReturn(true);

        $this->expectException(ValidationException::class);

        $this->service->deleteGame(1, 5);
    }

    public function test_delete_game_delegates_deletion_to_repository(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 5)
            ->andReturn(true);

        $this->gameRepository->shouldReceive('gameHasRounds')
            ->once()
            ->with(1)
            ->andReturn(false);

        $this->gameRepository->shouldReceive('deleteGame')
            ->once()
            ->with(1);

        $this->service->deleteGame(1, 5);
    }

    public function test_create_rematch_throws_when_source_game_is_in_progress(): void
    {
        $game = new Game(['status' => GameStatus::InProgress]);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(5)
            ->andReturn($game);

        $user     = new User();
        $user->id = 1;

        $this->expectException(ValidationException::class);

        $this->service->createRematch(5, ['name' => 'Rematch', 'target_points' => 2000], $user);
    }

    public function test_create_rematch_aborts_when_not_creator(): void
    {
        $game = new Game(['status' => GameStatus::Finished]);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(5)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(5, 99)
            ->andReturn(false);

        $user     = new User();
        $user->id = 99;

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);

        $this->service->createRematch(5, ['name' => 'Rematch', 'target_points' => 2000], $user);
    }

    public function test_create_rematch_creates_new_game_with_teams_seats_and_invitations(): void
    {
        $sourceGame = new Game(['status' => GameStatus::Finished]);

        $newGame     = new Game(['name' => 'Rematch', 'target_points' => 2000]);
        $newGame->id = 20;

        $user     = new User();
        $user->id = 5;

        $summaryData = $this->makeGameSummaryData(20);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(5)
            ->andReturn($sourceGame);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(5, 5)
            ->andReturn(true);

        DB::shouldReceive('transaction')
            ->once()
            ->andReturnUsing(fn ($cb) => $cb());

        $this->gameRepository->shouldReceive('createGame')
            ->once()
            ->andReturn($newGame);

        $this->gameRepository->shouldReceive('attachUserToGame')
            ->once()
            ->with(20, 5, GameUserRole::Creator->value);

        $this->teamRepository->shouldReceive('getOrderedTeamIdsForGame')
            ->once()
            ->with(5)
            ->andReturn(collect([1, 2]));

        $this->teamRepository->shouldReceive('attachTeamToGame')
            ->twice();

        $this->seatRepository->shouldReceive('copySeatsFromGame')
            ->once()
            ->with(5, 20);

        $this->seatRepository->shouldReceive('computeNextCutterSeatNumber')
            ->once()
            ->with($sourceGame)
            ->andReturn(3);

        $this->gameRepository->shouldReceive('updateGameInitialShufflerSeat')
            ->once()
            ->with($newGame, 3);

        $this->invitationService->shouldReceive('sendRematchInvitations')
            ->once()
            ->with(5, 20, $user);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(20)
            ->andReturn($summaryData);

        $result = $this->service->createRematch(5, ['name' => 'Rematch', 'target_points' => 2000], $user);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('game', $result);
        $this->assertArrayHasKey('teams', $result);
    }

    // ─── delegateHost ─────────────────────────────────────────────────────────

    public function test_list_game_viewers_delegates_to_repository(): void
    {
        $game    = new Game();
        $viewers = collect([
            (object) ['id' => 10, 'name' => 'Alice', 'email' => 'alice@example.com'],
        ]);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(7)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('getGameViewers')
            ->once()
            ->with(7)
            ->andReturn($viewers);

        $result = $this->service->listGameViewers(7);

        $this->assertCount(1, $result);
        $this->assertEquals(10, $result->first()->id);
    }

    public function test_delegate_host_aborts_when_not_creator(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 99)
            ->andReturn(false);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);

        $this->service->delegateHost(1, 99, 10);
    }

    public function test_delegate_host_throws_when_target_is_not_a_viewer(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 5)
            ->andReturn(true);

        $this->gameRepository->shouldReceive('getGameViewers')
            ->once()
            ->with(1)
            ->andReturn(collect([
                (object) ['id' => 20, 'name' => 'Carol', 'email' => 'carol@example.com'],
            ]));

        $this->expectException(ValidationException::class);

        // user_id 99 is not in the viewers list
        $this->service->delegateHost(1, 5, 99);
    }

    public function test_delegate_host_swaps_roles_atomically_and_returns_updated_game(): void
    {
        $game        = new Game();
        $returnedGame = new Game();
        $returnedGame->id        = 1;
        $returnedGame->user_role = GameUserRole::Viewer->value;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 5)
            ->andReturn(true);

        $this->gameRepository->shouldReceive('getGameViewers')
            ->once()
            ->with(1)
            ->andReturn(collect([
                (object) ['id' => 10, 'name' => 'Alice', 'email' => 'alice@example.com'],
            ]));

        DB::shouldReceive('transaction')
            ->once()
            ->andReturnUsing(fn ($cb) => $cb());

        $this->gameRepository->shouldReceive('updateUserRole')
            ->once()
            ->with(1, 10, GameUserRole::Creator->value);

        $this->gameRepository->shouldReceive('updateUserRole')
            ->once()
            ->with(1, 5, GameUserRole::Viewer->value);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameWithUserRole')
            ->once()
            ->with(1, 5)
            ->andReturn($returnedGame);

        $result = $this->service->delegateHost(1, 5, 10);

        $this->assertSame($returnedGame, $result);
        $this->assertEquals(GameUserRole::Viewer->value, $result->user_role);
    }

    public function test_delegate_host_broadcasts_game_role_updated_to_new_host(): void
    {
        Event::fake([GameRoleUpdated::class]);

        $game         = new Game();
        $returnedGame = new Game();
        $returnedGame->id        = 1;
        $returnedGame->user_role = GameUserRole::Viewer->value;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 5)
            ->andReturn(true);

        $this->gameRepository->shouldReceive('getGameViewers')
            ->once()
            ->with(1)
            ->andReturn(collect([
                (object) ['id' => 10, 'name' => 'Alice', 'email' => 'alice@example.com'],
            ]));

        DB::shouldReceive('transaction')
            ->once()
            ->andReturnUsing(fn ($cb) => $cb());

        $this->gameRepository->shouldReceive('updateUserRole')
            ->once()
            ->with(1, 10, GameUserRole::Creator->value);

        $this->gameRepository->shouldReceive('updateUserRole')
            ->once()
            ->with(1, 5, GameUserRole::Viewer->value);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameWithUserRole')
            ->once()
            ->with(1, 5)
            ->andReturn($returnedGame);

        $this->service->delegateHost(1, 5, 10);

        Event::assertDispatched(GameRoleUpdated::class, function (GameRoleUpdated $event): bool {
            return $event->userId  === 10
                && $event->gameId  === 1
                && $event->newRole === GameUserRole::Creator->value;
        });
    }

    // -------------------------------------------------------------------------
    // extendGame
    // -------------------------------------------------------------------------

    public function test_extend_game_reactivates_finished_game_and_broadcasts(): void
    {
        Event::fake();

        $game          = new Game();
        $game->id      = 1;
        $game->status  = GameStatus::Finished;

        $extendedGame          = new Game();
        $extendedGame->id      = 1;
        $extendedGame->status  = GameStatus::InProgress;
        $extendedGame->target_points = 3000;

        $returnedGame           = new Game();
        $returnedGame->id       = 1;
        $returnedGame->user_role = GameUserRole::Creator->value;

        $summaryData = $this->makeGameSummaryData(1);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 7)
            ->andReturn(true);

        $this->gameRepository->shouldReceive('getHighestTeamScore')
            ->once()
            ->with(1)
            ->andReturn(2500);

        $this->gameRepository->shouldReceive('extendGame')
            ->once()
            ->with($game, 3000)
            ->andReturn($extendedGame);

        $this->gameRepository->shouldReceive('forgetGameSummaryCache')
            ->once()
            ->with(1);

        $this->gameRepository->shouldReceive('getGameSummary')
            ->once()
            ->with(1)
            ->andReturn($summaryData);

        $this->gameRepository->shouldReceive('getGameWithUserRole')
            ->once()
            ->with(1, 7)
            ->andReturn($returnedGame);

        $result = $this->service->extendGame(1, ['target_points' => 3000], 7);

        $this->assertSame($returnedGame, $result);
        Event::assertDispatched(GameUpdated::class, function (GameUpdated $event): bool {
            return $event->gameId === 1;
        });
    }

    public function test_extend_game_throws_if_game_is_not_finished(): void
    {
        $game         = new Game();
        $game->id     = 1;
        $game->status = GameStatus::InProgress;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->extendGame(1, ['target_points' => 3000], 7);
    }

    public function test_extend_game_aborts_403_if_caller_is_not_creator(): void
    {
        $game         = new Game();
        $game->id     = 1;
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 99)
            ->andReturn(false);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);

        $this->service->extendGame(1, ['target_points' => 3000], 99);
    }

    public function test_extend_game_throws_when_new_target_does_not_exceed_highest_score(): void
    {
        $game         = new Game();
        $game->id     = 1;
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->gameRepository->shouldReceive('isGameCreator')
            ->once()
            ->with(1, 7)
            ->andReturn(true);

        $this->gameRepository->shouldReceive('getHighestTeamScore')
            ->once()
            ->with(1)
            ->andReturn(1500);

        $this->expectException(ValidationException::class);

        // 1500 is not > 1500, so this must be rejected.
        $this->service->extendGame(1, ['target_points' => 1500], 7);
    }
}
