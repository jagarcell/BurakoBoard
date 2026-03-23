<?php

namespace Tests\Feature\Api;

use App\Events\GameInvitationSent;
use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class GameInvitationBroadcastTest extends TestCase
{
    use RefreshDatabase;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Create a minimal in-progress game record.
     *
     * @param  string  $name  Display name of the game.
     * @return \App\Models\Game The created game.
     * Logic: produce a valid game without requiring full setup so individual
     *   test cases can focus on the broadcast assertion.
     */
    private function createGame(string $name = 'Broadcast Game'): Game
    {
        return Game::query()->create([
            'name'                         => $name,
            'target_points'                => 2000,
            'status'                       => 'in_progress',
            'winning_team_id'              => null,
            'current_round_number'         => 0,
            'initial_shuffler_seat_number' => null,
        ]);
    }

    /**
     * Insert a game_user pivot row for a given user and role.
     *
     * @param  int     $gameId  Identifier of the game.
     * @param  int     $userId  Identifier of the user.
     * @param  string  $role    Role to assign.
     * @return void
     * Logic: raw insert so tests don't invoke the service layer to set up state.
     */
    private function attachUserToGame(int $gameId, int $userId, string $role): void
    {
        DB::table('game_user')->insert([
            'game_id'    => $gameId,
            'user_id'    => $userId,
            'role'       => $role,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    /**
     * Sending invitations dispatches one GameInvitationSent event per invitee.
     *
     * Logic: fake both the Event and Mail facades so nothing hits I/O; assert
     *   the event is dispatched with the correct invitee ID, game ID, and names.
     */
    public function test_sending_invitations_broadcasts_event_for_each_invitee(): void
    {
        Event::fake([GameInvitationSent::class]);
        Mail::fake();

        $creator = User::factory()->create(['name' => 'Alice']);
        $invitee = User::factory()->create(['name' => 'Bob']);
        $game    = $this->createGame('Poker Night');

        $this->attachUserToGame($game->id, $creator->id, 'creator');

        $this->actingAs($creator)
            ->postJson("/api/v1/games/{$game->id}/invitations", [
                'user_ids' => [$invitee->id],
            ])
            ->assertStatus(201);

        Event::assertDispatched(GameInvitationSent::class, function (GameInvitationSent $event) use ($invitee, $game, $creator): bool {
            return $event->inviteeId   === $invitee->id
                && $event->gameId      === $game->id
                && $event->gameName    === $game->name
                && $event->inviterName === $creator->name;
        });
    }

    /**
     * Each invitee receives its own broadcast event.
     *
     * Logic: invite two users and assert two separate dispatches, one targeting
     *   each invitee's ID.
     */
    public function test_one_event_dispatched_per_invitee(): void
    {
        Event::fake([GameInvitationSent::class]);
        Mail::fake();

        $creator  = User::factory()->create();
        $invitee1 = User::factory()->create();
        $invitee2 = User::factory()->create();
        $game     = $this->createGame();

        $this->attachUserToGame($game->id, $creator->id, 'creator');

        $this->actingAs($creator)
            ->postJson("/api/v1/games/{$game->id}/invitations", [
                'user_ids' => [$invitee1->id, $invitee2->id],
            ])
            ->assertStatus(201);

        Event::assertDispatched(GameInvitationSent::class, 2);

        Event::assertDispatched(GameInvitationSent::class, fn (GameInvitationSent $e) => $e->inviteeId === $invitee1->id);
        Event::assertDispatched(GameInvitationSent::class, fn (GameInvitationSent $e) => $e->inviteeId === $invitee2->id);
    }

    /**
     * No event is dispatched when all user IDs are already enrolled in the game.
     *
     * Logic: attach the target user before sending; the service skips existing
     *   members and the event must not fire.
     */
    public function test_no_event_dispatched_when_all_users_already_enrolled(): void
    {
        Event::fake([GameInvitationSent::class]);
        Mail::fake();

        $creator = User::factory()->create();
        $invitee = User::factory()->create();
        $game    = $this->createGame();

        $this->attachUserToGame($game->id, $creator->id, 'creator');
        $this->attachUserToGame($game->id, $invitee->id, 'pending_invitee');

        $this->actingAs($creator)
            ->postJson("/api/v1/games/{$game->id}/invitations", [
                'user_ids' => [$invitee->id],
            ])
            ->assertStatus(201);

        Event::assertNotDispatched(GameInvitationSent::class);
    }

    /**
     * The event broadcasts on the correct private channel.
     *
     * Logic: instantiate the event directly and assert its broadcastOn() returns
     *   a PrivateChannel keyed to the invitee's user ID.
     */
    public function test_event_broadcasts_on_correct_private_channel(): void
    {
        $event = new GameInvitationSent(
            inviteeId:   42,
            gameId:      7,
            gameName:    'Night Game',
            inviterName: 'Alice',
        );

        $channels = $event->broadcastOn();

        $this->assertCount(1, $channels);
        $this->assertEquals('private-App.Models.User.42', $channels[0]->name);
    }

    /**
     * The event exposes the correct broadcast payload.
     *
     * Logic: call broadcastWith() and assert the keys and values match the
     *   frontend contract.
     */
    public function test_event_broadcast_payload_contains_expected_fields(): void
    {
        $event = new GameInvitationSent(
            inviteeId:   5,
            gameId:      3,
            gameName:    'Weekend Burako',
            inviterName: 'Carlos',
        );

        $payload = $event->broadcastWith();

        $this->assertSame(3, $payload['game_id']);
        $this->assertSame('Weekend Burako', $payload['game_name']);
        $this->assertSame('Carlos', $payload['inviter_name']);
    }

    /**
     * The event uses the correct broadcast event name.
     *
     * Logic: assert the short, explicit event name keeps the frontend contract
     *   stable and independent from PHP class naming.
     */
    public function test_event_broadcast_name(): void
    {
        $event = new GameInvitationSent(1, 1, 'Test', 'Tester');

        $this->assertSame('game.invitation.sent', $event->broadcastAs());
    }
}
