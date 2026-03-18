<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Tests\TestCase;

class GoogleAuthTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Build a partial mock of the Socialite Google driver that returns the
     * given user object from ->user().
     *
     * @param  SocialiteUser  $socialiteUser
     * @return void
     */
    private function mockSocialiteDriver(SocialiteUser $socialiteUser): void
    {
        $driver = Mockery::mock('Laravel\Socialite\Two\GoogleProvider');
        $driver->shouldReceive('user')->andReturn($socialiteUser);

        Socialite::shouldReceive('driver')
            ->with('google')
            ->andReturn($driver);
    }

    /**
     * Build a minimal Socialite user object.
     *
     * @param  string  $id
     * @param  string  $email
     * @param  string  $name
     * @return SocialiteUser
     */
    private function makeSocialiteUser(
        string $id,
        string $email,
        string $name = 'Test User',
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

    public function test_google_redirect_route_redirects_to_google(): void
    {
        $driver = Mockery::mock('Laravel\Socialite\Two\GoogleProvider');
        $driver->shouldReceive('redirect')
            ->andReturn(redirect('https://accounts.google.com/o/oauth2/auth'));

        Socialite::shouldReceive('driver')
            ->with('google')
            ->andReturn($driver);

        $response = $this->get(route('auth.google.redirect'));

        $response->assertRedirect();
    }

    // -------------------------------------------------------------------------
    // Callback — new user
    // -------------------------------------------------------------------------

    public function test_callback_creates_new_user_and_logs_in(): void
    {
        $socialiteUser = $this->makeSocialiteUser('google-123', 'new@example.com', 'New User');
        $this->mockSocialiteDriver($socialiteUser);

        $response = $this->get(route('auth.google.callback'));

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));

        $this->assertDatabaseHas('users', [
            'email'     => 'new@example.com',
            'google_id' => 'google-123',
        ]);
    }

    // -------------------------------------------------------------------------
    // Callback — existing user matched by google_id
    // -------------------------------------------------------------------------

    public function test_callback_logs_in_existing_user_by_google_id(): void
    {
        $user = User::factory()->create(['google_id' => 'google-456']);
        $socialiteUser = $this->makeSocialiteUser('google-456', $user->email, $user->name);
        $this->mockSocialiteDriver($socialiteUser);

        $response = $this->get(route('auth.google.callback'));

        $this->assertAuthenticatedAs($user);
        $response->assertRedirect(route('dashboard', absolute: false));
    }

    // -------------------------------------------------------------------------
    // Callback — existing user matched by e-mail, google_id attached
    // -------------------------------------------------------------------------

    public function test_callback_attaches_google_id_to_existing_email_account(): void
    {
        $user = User::factory()->create(['email' => 'existing@example.com', 'google_id' => null]);
        $socialiteUser = $this->makeSocialiteUser('google-789', 'existing@example.com');
        $this->mockSocialiteDriver($socialiteUser);

        $response = $this->get(route('auth.google.callback'));

        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseHas('users', [
            'id'        => $user->id,
            'google_id' => 'google-789',
        ]);
    }

    // -------------------------------------------------------------------------
    // Callback — invalid state exception (expired / replayed session)
    // -------------------------------------------------------------------------

    public function test_callback_redirects_to_login_with_error_on_invalid_state(): void
    {
        $driver = Mockery::mock('Laravel\Socialite\Two\GoogleProvider');
        $driver->shouldReceive('user')->andThrow(new InvalidStateException());

        Socialite::shouldReceive('driver')
            ->with('google')
            ->andReturn($driver);

        $response = $this->get(route('auth.google.callback'));

        $this->assertGuest();
        $response->assertRedirect(route('login'));
        $response->assertSessionHas(
            'error',
            'The sign-in request was invalid or has expired. Please try again.'
        );
    }

    // -------------------------------------------------------------------------
    // Callback — generic exception (network error, revoked credentials, etc.)
    // -------------------------------------------------------------------------

    public function test_callback_redirects_to_login_with_error_on_generic_exception(): void
    {
        $driver = Mockery::mock('Laravel\Socialite\Two\GoogleProvider');
        $driver->shouldReceive('user')->andThrow(new \Exception('Something went wrong'));

        Socialite::shouldReceive('driver')
            ->with('google')
            ->andReturn($driver);

        $response = $this->get(route('auth.google.callback'));

        $this->assertGuest();
        $response->assertRedirect(route('login'));
        $response->assertSessionHas('error', 'Sign-in with Google failed. Please try again.');
    }

    // -------------------------------------------------------------------------
    // Redirect is only available to guests
    // -------------------------------------------------------------------------

    public function test_authenticated_user_cannot_access_google_redirect(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get(route('auth.google.redirect'));

        $response->assertRedirect(route('dashboard', absolute: false));
    }
}
