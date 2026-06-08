<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;
use Tests\TestCase;

class GameInvitationStoreTest extends TestCase
{
    use RefreshDatabase;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Create a minimal in-progress game record.
     *
     * @param  string  $name  Display name for the game.
     * @return \App\Models\Game The newly created game.
     * Logic: insert a game with sensible defaults so individual test cases only need to
     *   supply what they care about.
     */
    private function createGame(string $name = 'Test Game'): Game
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
     * Insert a game_user pivot row for the given user and role.
     *
     * @param  int     $gameId  Identifier of the game.
     * @param  int     $userId  Identifier of the user.
     * @param  string  $role    Role to assign: creator, pending_invitee, or viewer.
     * @return void
     * Logic: insert a single raw pivot row to set up game membership scenarios without invoking the service layer.
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
    // Auth guard
    // -------------------------------------------------------------------------

    /**
     * Ensure the invitations endpoint requires authentication.
     *
     * @return void Verifies the Sanctum guard rejects unauthenticated requests with 401.
     * Logic: call the POST endpoint without a session and assert it returns Unauthorized.
     */
    public function test_unauthenticated_request_is_rejected(): void
    {
        $game = $this->createGame();

        $this->postJson("/api/v1/games/{$game->id}/invitations", ['user_ids' => [1]])
            ->assertUnauthorized();
    }

    // -------------------------------------------------------------------------
    // Validation
    // -------------------------------------------------------------------------

    /**
     * Ensure the endpoint rejects a request that omits the user_ids field.
     *
     * @return void Verifies a 422 response is returned when user_ids is missing.
     * Logic: authenticate a user and POST without user_ids; assert the validation error key is present.
     */
    public function test_missing_user_ids_returns_validation_error(): void
    {
        $creator = User::factory()->create();
        $game    = $this->createGame();
        $this->attachUserToGame($game->id, $creator->id, 'creator');

        $this->actingAs($creator)
            ->postJson("/api/v1/games/{$game->id}/invitations", [])
            ->assertUnprocessable()
            ->assertJsonPath('status', 'error')
            ->assertJsonStructure(['data' => ['errors' => ['invitations']]]);
    }

    /**
     * Ensure the endpoint rejects an empty user_ids array.
     *
     * @return void Verifies a 422 response is returned when user_ids is present but empty.
     * Logic: POST with an empty array and assert that the min:1 rule triggers a validation error.
     */
    public function test_empty_user_ids_array_returns_validation_error(): void
    {
        $creator = User::factory()->create();
        $game    = $this->createGame();
        $this->attachUserToGame($game->id, $creator->id, 'creator');

        $this->actingAs($creator)
            ->postJson("/api/v1/games/{$game->id}/invitations", ['user_ids' => []])
            ->assertUnprocessable()
            ->assertJsonPath('status', 'error')
            ->assertJsonStructure(['data' => ['errors' => ['invitations']]]);
    }

    /**
     * Ensure the endpoint rejects user IDs that do not exist in the database.
     *
     * @return void Verifies a 422 response is returned for non-existent user IDs.
     * Logic: supply an ID that has no corresponding users row and assert the `exists` rule fires.
     */
    public function test_nonexistent_user_id_returns_validation_error(): void
    {
        $creator = User::factory()->create();
        $game    = $this->createGame();
        $this->attachUserToGame($game->id, $creator->id, 'creator');

        $this->actingAs($creator)
            ->postJson("/api/v1/games/{$game->id}/invitations", ['user_ids' => [99999]])
            ->assertUnprocessable()
            ->assertJsonPath('status', 'error')
            ->assertJsonStructure(['data' => ['errors' => ['user_ids.0']]]);
    }

    // -------------------------------------------------------------------------
    // Happy path
    // -------------------------------------------------------------------------

    /**
     * Ensure invitations are persisted and emails are dispatched for valid user IDs.
     *
     * @return void Verifies pivot rows are inserted and exactly one mail per invitee is sent.
     * Logic: fake the Mail facade, POST valid user IDs, then assert the pivot table has
     *   pending_invitee rows for each invited user and GameInvitationMail was sent to each.
     */
    public function test_valid_invitation_creates_pivot_rows_and_sends_emails(): void
    {
        Mail::fake();

        $creator  = User::factory()->create(['name' => 'Creator', 'email' => 'creator@example.com']);
        $invitee1 = User::factory()->create(['name' => 'Alice',   'email' => 'alice@example.com']);
        $invitee2 = User::factory()->create(['name' => 'Bob',     'email' => 'bob@example.com']);
        $game     = $this->createGame();
        $this->attachUserToGame($game->id, $creator->id, 'creator');

        $response = $this->actingAs($creator)->postJson(
            "/api/v1/games/{$game->id}/invitations",
            ['user_ids' => [$invitee1->id, $invitee2->id]],
        );

        $response->assertCreated()
            ->assertJsonPath('data.invited_count', 2);

        $this->assertDatabaseHas('game_user', [
            'game_id' => $game->id,
            'user_id' => $invitee1->id,
            'role'    => 'pending_invitee',
        ]);

        $this->assertDatabaseHas('game_user', [
            'game_id' => $game->id,
            'user_id' => $invitee2->id,
            'role'    => 'pending_invitee',
        ]);

        Mail::assertSentCount(2);
        Mail::assertSent(\App\Mail\GameInvitationMail::class, fn ($mail) => $mail->hasTo($invitee1->email));
        Mail::assertSent(\App\Mail\GameInvitationMail::class, fn ($mail) => $mail->hasTo($invitee2->email));
    }

    /**
     * Ensure the endpoint returns a 201 with invited_count = 0 when all supplied user IDs
     * are already enrolled in the game.
     *
     * @return void Verifies already-enrolled users are silently skipped without an error.
     * Logic: attach both target users to the game beforehand, POST their IDs, and assert
     *   the response indicates zero new invitations and no mail was sent.
     */
    public function test_already_enrolled_users_are_skipped_without_error(): void
    {
        Mail::fake();

        $creator  = User::factory()->create();
        $existing = User::factory()->create();
        $game     = $this->createGame();
        $this->attachUserToGame($game->id, $creator->id,  'creator');
        $this->attachUserToGame($game->id, $existing->id, 'viewer');

        $response = $this->actingAs($creator)->postJson(
            "/api/v1/games/{$game->id}/invitations",
            ['user_ids' => [$existing->id]],
        );

        $response->assertCreated()
            ->assertJsonPath('data.invited_count', 0);

        Mail::assertNothingSent();
    }

    /**
     * Ensure only new users are invited when the payload contains a mix of already-enrolled
     * users and genuinely new ones.
     *
     * @return void Verifies only the truly new invitees receive pivot rows and emails.
     * Logic: set one user as an existing viewer, include their ID alongside a new user ID,
     *   and assert only the new user gets a pivot row and an email.
     */
    public function test_mixed_payload_only_invites_new_users(): void
    {
        Mail::fake();

        $creator     = User::factory()->create();
        $existingUser = User::factory()->create(['email' => 'existing@example.com']);
        $newInvitee  = User::factory()->create(['email' => 'new@example.com']);
        $game        = $this->createGame();
        $this->attachUserToGame($game->id, $creator->id,      'creator');
        $this->attachUserToGame($game->id, $existingUser->id, 'viewer');

        $response = $this->actingAs($creator)->postJson(
            "/api/v1/games/{$game->id}/invitations",
            ['user_ids' => [$existingUser->id, $newInvitee->id]],
        );

        $response->assertCreated()
            ->assertJsonPath('data.invited_count', 1);

        $this->assertDatabaseHas('game_user', [
            'game_id' => $game->id,
            'user_id' => $newInvitee->id,
            'role'    => 'pending_invitee',
        ]);

        Mail::assertSentCount(1);
        Mail::assertSent(\App\Mail\GameInvitationMail::class, fn ($mail) => $mail->hasTo($newInvitee->email));
        Mail::assertNotSent(\App\Mail\GameInvitationMail::class, fn ($mail) => $mail->hasTo($existingUser->email));
    }

    /**
     * Ensure the endpoint returns 404 for an invitation request on a non-existent game.
     *
     * @return void Verifies the service's findGameOrFail call produces a 404.
     * Logic: POST to an ID that does not exist in the games table and assert the API surface
     *   returns a Not Found response.
     */
    public function test_invitation_for_nonexistent_game_returns_404(): void
    {
        $creator  = User::factory()->create();
        $invitee  = User::factory()->create();

        $this->actingAs($creator)
            ->postJson('/api/v1/games/99999/invitations', ['user_ids' => [$invitee->id]])
            ->assertNotFound();
    }

    /**
     * A mail transport failure logs a warning but the invitation pivot row is still stored.
     *
     * @param  void
     * @return void Asserts that a TransportException during send is caught, logged as a warning,
     *   and the overall endpoint still returns 201 with the invitation persisted.
     * Logic: use Mail::shouldReceive to force a TransportExceptionInterface throw on send(),
     *   fake the Log facade, POST the invitation, assert the pivot row exists and
     *   Log::warning('Invitation email failed') was emitted with the correct game_id and recipient.
     */
    public function test_mail_transport_failure_logs_warning_but_invitation_is_still_stored(): void
    {
        $spy = Log::spy();

        $creator = User::factory()->create();
        $invitee = User::factory()->create(['email' => 'invitee@example.com']);
        $game    = $this->createGame();
        $this->attachUserToGame($game->id, $creator->id, 'creator');

        // Build a concrete anonymous class that implements both interfaces required
        // by Symfony's mailer so it passes the instanceof check inside the service.
        $transportException = new class('SMTP connection refused') extends \RuntimeException
            implements TransportExceptionInterface
        {
            public function getDebug(): string { return ''; }
            public function appendDebug(string $debug): void {}
        };

        Mail::shouldReceive('to->send')->andThrow($transportException);

        $response = $this->actingAs($creator)->postJson(
            "/api/v1/games/{$game->id}/invitations",
            ['user_ids' => [$invitee->id]],
        );

        $response->assertCreated()
            ->assertJsonPath('data.invited_count', 1);

        $this->assertDatabaseHas('game_user', [
            'game_id' => $game->id,
            'user_id' => $invitee->id,
            'role'    => 'pending_invitee',
        ]);

        $spy->shouldHaveReceived('warning')->withArgs(function (string $message, array $context) use ($game, $invitee): bool {
            return $message === 'Invitation email failed'
                && ($context['game_id'] ?? null) === $game->id
                && ($context['recipient'] ?? null) === $invitee->email;
        });
    }
}
