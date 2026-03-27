<?php

namespace Tests\Unit\Services;

use App\Events\GameInvitationSent;
use App\Mail\GameInvitationMail;
use App\Models\Game;
use App\Models\User;
use App\Repositories\GameRepository;
use App\Repositories\InvitationRepository;
use App\Services\InvitationService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class InvitationServiceTest extends TestCase
{
    private GameRepository&MockInterface $gameRepository;
    private InvitationRepository&MockInterface $invitationRepository;
    private InvitationService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->gameRepository       = Mockery::mock(GameRepository::class);
        $this->invitationRepository = Mockery::mock(InvitationRepository::class);

        $this->service = new InvitationService(
            $this->gameRepository,
            $this->invitationRepository,
        );
    }

    public function test_list_pending_invitations_delegates_to_repository(): void
    {
        $this->invitationRepository->shouldReceive('getPendingInvitations')
            ->once()
            ->with(5)
            ->andReturn(collect([]));

        $result = $this->service->listPendingInvitations(5);

        $this->assertInstanceOf(\Illuminate\Support\Collection::class, $result);
    }

    public function test_user_has_pending_invitations_returns_true(): void
    {
        $this->invitationRepository->shouldReceive('hasPendingInvitations')
            ->once()
            ->with(5)
            ->andReturn(true);

        $this->assertTrue($this->service->userHasPendingInvitations(5));
    }

    public function test_user_has_pending_invitations_returns_false(): void
    {
        $this->invitationRepository->shouldReceive('hasPendingInvitations')
            ->once()
            ->with(5)
            ->andReturn(false);

        $this->assertFalse($this->service->userHasPendingInvitations(5));
    }

    public function test_list_invitable_users_delegates_to_repository(): void
    {
        $paginator = Mockery::mock(LengthAwarePaginator::class);

        $this->invitationRepository->shouldReceive('getInvitableUsersForGame')
            ->once()
            ->with(1, 2, 1, 10)
            ->andReturn($paginator);

        $result = $this->service->listInvitableUsers(1, 2, 1, 10);

        $this->assertSame($paginator, $result);
    }

    public function test_send_invitations_returns_zero_when_all_already_enrolled(): void
    {
        $game     = new Game(['id' => 1, 'name' => 'Alpha']);
        $game->id = 1;

        $inviter = new User(['id' => 10, 'name' => 'Host']);

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->invitationRepository->shouldReceive('getExistingGameUserIds')
            ->once()
            ->with(1, [2, 3])
            ->andReturn([2, 3]);

        $result = $this->service->sendInvitations(1, [2, 3], $inviter);

        $this->assertSame(0, $result);
    }

    public function test_send_invitations_filters_existing_and_dispatches_mail(): void
    {
        Mail::fake();

        $game       = new Game(['id' => 1, 'name' => 'Alpha']);
        $game->id   = 1;
        $game->name = 'Alpha';

        $inviter       = new User(['id' => 10, 'name' => 'Host']);
        $inviter->id   = 10;
        $inviter->name = 'Host';

        $invitee        = new User(['id' => 3, 'name' => 'Bob', 'email' => 'bob@example.com']);
        $invitee->id    = 3;
        $invitee->email = 'bob@example.com';
        $invitee->name  = 'Bob';

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->invitationRepository->shouldReceive('getExistingGameUserIds')
            ->once()
            ->with(1, [2, 3])
            ->andReturn([2]);

        $this->invitationRepository->shouldReceive('bulkAttachPendingInviteesToGame')
            ->once()
            ->with(1, [3]);

        $this->invitationRepository->shouldReceive('getUsersByIds')
            ->once()
            ->with([3])
            ->andReturn(collect([$invitee]));

        $result = $this->service->sendInvitations(1, [2, 3], $inviter);

        $this->assertSame(1, $result);
        Mail::assertSent(GameInvitationMail::class);
    }

    public function test_accept_invitation_throws_when_no_pending_invitation(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->invitationRepository->shouldReceive('upgradeInvitationToViewer')
            ->once()
            ->with(1, 5)
            ->andReturn(false);

        $this->expectException(ValidationException::class);

        $this->service->acceptInvitation(1, 5);
    }

    public function test_accept_invitation_returns_game_on_success(): void
    {
        $game          = new Game();
        $game->id      = 1;
        $gameWithRole  = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->invitationRepository->shouldReceive('upgradeInvitationToViewer')
            ->once()
            ->with(1, 5)
            ->andReturn(true);

        $this->gameRepository->shouldReceive('getGameWithUserRole')
            ->once()
            ->with(1, 5)
            ->andReturn($gameWithRole);

        $result = $this->service->acceptInvitation(1, 5);

        $this->assertSame($gameWithRole, $result);
    }

    public function test_accept_invitation_if_pending_returns_true_when_upgraded(): void
    {
        $this->invitationRepository->shouldReceive('upgradeInvitationToViewer')
            ->once()
            ->with(1, 5)
            ->andReturn(true);

        $this->assertTrue($this->service->acceptInvitationIfPending(1, 5));
    }

    public function test_accept_invitation_if_pending_returns_false_when_not_pending(): void
    {
        $this->invitationRepository->shouldReceive('upgradeInvitationToViewer')
            ->once()
            ->with(1, 5)
            ->andReturn(false);

        $this->assertFalse($this->service->acceptInvitationIfPending(1, 5));
    }
}
