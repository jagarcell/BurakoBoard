<?php

namespace Tests\Feature\Auth;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Tests\TestCase;

class AppleAuthTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Build a partial mock of the Socialite Apple driver that returns the
     * given user object from ->user().
     *
     * @param  SocialiteUser  $socialiteUser
     * @return void
     */
    private function mockSocialiteDriver(SocialiteUser $socialiteUser): void
    {
        $driver = Mockery::mock('SocialiteProviders\Apple\Provider');
        $driver->shouldReceive('user')->andReturn($socialiteUser);

        Socialite::shouldReceive('driver')
            ->with('apple')
            ->andReturn($driver);
    }

    /**
     * Build a minimal Socialite user object for Apple Sign In.
     *
     * @param  string  $id
     * @param  string  $email
     * @param  string|null  $name
     * @return SocialiteUser
     */
    private function makeSocialiteUser(
        string $id,
        string $email,
        ?string $name = 'Test User',
    ): SocialiteUser {
        $user = new SocialiteUser();
        $user->map([
            'id'    => $id,
            'email' => $email,
            'name'  => $name,
        ]);

        return $user;
    }

    // -------------------------------------------------------------------------
    // Redirect
    // -------------------------------------------------------------------------

    public function test_apple_redirect_route_redirects_to_apple(): void
    {
        $driver = Mockery::mock('SocialiteProviders\Apple\Provider');
        $driver->shouldReceive('redirect')
            ->andReturn(redirect('https://appleid.apple.com/auth/authorize'));

        Socialite::shouldReceive('driver')
            ->with('apple')
            ->andReturn($driver);

        $response = $this->get(route('auth.apple.redirect'));

        $response->assertRedirect();
    }

    // -------------------------------------------------------------------------
    // Callback — new user
    // -------------------------------------------------------------------------

    public function test_callback_creates_new_user_and_logs_in(): void
    {
        $socialiteUser = $this->makeSocialiteUser('apple-123', 'new@example.com', 'New User');
        $this->mockSocialiteDriver($socialiteUser);

        $response = $this->post(route('auth.apple.callback'));

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));

        $this->assertDatabaseHas('users', [
            'email'    => 'new@example.com',
            'apple_id' => 'apple-123',
        ]);
    }

    // -------------------------------------------------------------------------
    // Callback — new user with no name falls back to email local-part
    // -------------------------------------------------------------------------

    public function test_callback_uses_email_local_part_when_name_is_null(): void
    {
        $socialiteUser = $this->makeSocialiteUser('apple-999', 'john@example.com', null);
        $this->mockSocialiteDriver($socialiteUser);

        $this->post(route('auth.apple.callback'));

        $this->assertDatabaseHas('users', [
            'email' => 'john@example.com',
            'name'  => 'john',
        ]);
    }

    // -------------------------------------------------------------------------
    // Callback — existing user matched by apple_id
    // -------------------------------------------------------------------------

    public function test_callback_logs_in_existing_user_by_apple_id(): void
    {
        $user = User::factory()->create(['apple_id' => 'apple-456']);
        $socialiteUser = $this->makeSocialiteUser('apple-456', $user->email, $user->name);
        $this->mockSocialiteDriver($socialiteUser);

        $response = $this->post(route('auth.apple.callback'));

        $this->assertAuthenticatedAs($user);
        $response->assertRedirect(route('dashboard', absolute: false));
    }

    // -------------------------------------------------------------------------
    // Callback — existing user matched by e-mail, apple_id attached
    // -------------------------------------------------------------------------

    public function test_callback_attaches_apple_id_to_existing_email_account(): void
    {
        $user = User::factory()->create(['email' => 'existing@example.com', 'apple_id' => null]);
        $socialiteUser = $this->makeSocialiteUser('apple-789', 'existing@example.com');
        $this->mockSocialiteDriver($socialiteUser);

        $this->post(route('auth.apple.callback'));

        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseHas('users', [
            'id'       => $user->id,
            'apple_id' => 'apple-789',
        ]);
    }

    // -------------------------------------------------------------------------
    // Callback — invalid state exception (expired / replayed session)
    // -------------------------------------------------------------------------

    public function test_callback_redirects_to_login_with_error_on_invalid_state(): void
    {
        $driver = Mockery::mock('SocialiteProviders\Apple\Provider');
        $driver->shouldReceive('user')->andThrow(new InvalidStateException());

        Socialite::shouldReceive('driver')
            ->with('apple')
            ->andReturn($driver);

        $response = $this->post(route('auth.apple.callback'));

        $this->assertGuest();
        $response->assertRedirect(route('login'));
        $response->assertSessionHas(
            'error',
            'The sign-in request was invalid or has expired. Please try again.'
        );
    }

    /**
     * An InvalidStateException during Apple callback logs an info entry, not an error.
     *
     * @return void Asserts Log::info('OAuth invalid state (user action)') fires with provider and ip.
     * Logic: fake the Log facade, simulate InvalidStateException from Socialite, and assert
     *   the info channel received the expected message and context keys.
     */
    public function test_invalid_state_exception_logs_info(): void
    {
        $spy = Log::spy();

        $driver = Mockery::mock('SocialiteProviders\Apple\Provider');
        $driver->shouldReceive('user')->andThrow(new InvalidStateException());

        Socialite::shouldReceive('driver')
            ->with('apple')
            ->andReturn($driver);

        $this->post(route('auth.apple.callback'));

        $spy->shouldHaveReceived('info')->withArgs(function (string $message, array $context): bool {
            return $message === 'OAuth invalid state (user action)'
                && ($context['provider'] ?? null) === 'apple'
                && isset($context['ip']);
        });
    }

    // -------------------------------------------------------------------------
    // Callback — generic exception (network error, revoked credentials, etc.)
    // -------------------------------------------------------------------------

    public function test_callback_redirects_to_login_with_error_on_generic_exception(): void
    {
        $driver = Mockery::mock('SocialiteProviders\Apple\Provider');
        $driver->shouldReceive('user')->andThrow(new \Exception('Something went wrong'));

        Socialite::shouldReceive('driver')
            ->with('apple')
            ->andReturn($driver);

        $response = $this->post(route('auth.apple.callback'));

        $this->assertGuest();
        $response->assertRedirect(route('login'));
        $response->assertSessionHas('error', 'Sign-in with Apple failed. Please try again.');
    }

    /**
     * A generic exception during Apple callback logs an error entry before redirecting.
     *
     * @return void Asserts Log::error('OAuth authentication failure') fires with provider, exception, and ip.
     * Logic: fake the Log facade, throw a generic Exception from the Socialite driver, and assert
     *   the error channel received the expected message with the correct context keys.
     */
    public function test_generic_exception_logs_error(): void
    {
        $spy = Log::spy();

        $driver = Mockery::mock('SocialiteProviders\Apple\Provider');
        $driver->shouldReceive('user')->andThrow(new \Exception('Apple credentials revoked'));

        Socialite::shouldReceive('driver')
            ->with('apple')
            ->andReturn($driver);

        $this->post(route('auth.apple.callback'));

        $spy->shouldHaveReceived('error')->withArgs(function (string $message, array $context): bool {
            return $message === 'OAuth authentication failure'
                && ($context['provider'] ?? null) === 'apple'
                && ($context['exception'] ?? null) === \Exception::class
                && isset($context['ip']);
        });
    }

    // -------------------------------------------------------------------------
    // Redirect is only available to guests
    // -------------------------------------------------------------------------

    public function test_authenticated_user_cannot_access_apple_redirect(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get(route('auth.apple.redirect'));

        $response->assertRedirect(route('dashboard', absolute: false));
    }

    // -------------------------------------------------------------------------
    // Callback — auto-accept pending invitation stored in session
    // -------------------------------------------------------------------------

    /**
     * When the session contains an invitation_game_id (set when the user visited
     * the login page via an invitation link), the Apple callback silently
     * upgrades the user's role from pending_invitee to viewer.
     *
     * @return void Asserts the game_user role is updated to viewer after Apple login.
     * Logic: prime the session with an invitation_game_id, create a pending_invitee
     *   pivot row, hit the Apple callback, and assert the role is now viewer.
     */
    public function test_apple_callback_auto_accepts_pending_invitation_from_session(): void
    {
        $user = User::factory()->create(['apple_id' => 'apple-auto-accept']);

        $game = Game::query()->create([
            'name'                         => 'Invite Game',
            'target_points'                => 2000,
            'status'                       => 'in_progress',
            'winning_team_id'              => null,
            'current_round_number'         => 0,
            'initial_shuffler_seat_number' => null,
        ]);

        DB::table('game_user')->insert([
            'game_id'    => $game->id,
            'user_id'    => $user->id,
            'role'       => 'pending_invitee',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $socialiteUser = $this->makeSocialiteUser('apple-auto-accept', $user->email, $user->name);
        $this->mockSocialiteDriver($socialiteUser);

        // Prime the session with the invitation game ID (simulates visiting the login page via invitation link).
        $this->withSession(['invitation_game_id' => $game->id])
            ->post(route('auth.apple.callback'));

        $this->assertDatabaseHas('game_user', [
            'game_id' => $game->id,
            'user_id' => $user->id,
            'role'    => 'viewer',
        ]);
    }
}
