<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Facades\Socialite;
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
    // Redirect is only available to guests
    // -------------------------------------------------------------------------

    public function test_authenticated_user_cannot_access_apple_redirect(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get(route('auth.apple.redirect'));

        $response->assertRedirect(route('dashboard', absolute: false));
    }
}
