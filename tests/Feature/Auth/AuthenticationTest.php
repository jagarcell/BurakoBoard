<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_screen_can_be_rendered(): void
    {
        $response = $this->get('/login');

        $response->assertStatus(200);
    }

    public function test_users_can_authenticate_using_the_login_screen(): void
    {
        $user = User::factory()->create();

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));
    }

    public function test_users_can_not_authenticate_with_invalid_password(): void
    {
        $user = User::factory()->create();

        $this->post('/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $this->assertGuest();
    }

    public function test_users_can_logout(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/logout');

        $this->assertGuest();
        $response->assertRedirect('/');
    }

    /**
     * Visiting /login?email=... passes the email as an Inertia prop so the
     * frontend can pre-populate the email input.
     *
     * @return void Asserts the email query parameter surfaces as an Inertia prop.
     * Logic: issue a GET to the login route with an email query param and assert
     *   that the Inertia component receives that value under the `email` key.
     */
    public function test_login_screen_receives_email_prop_from_query_string(): void
    {
        $response = $this->get('/login?email=invited%40example.com');

        $response->assertStatus(200);
        $response->assertInertia(
            fn ($page) => $page
                ->component('Auth/Login')
                ->where('email', 'invited@example.com'),
        );
    }

    /**
     * When /login is visited without an email query param the email prop
     * defaults to an empty string so the form renders without a pre-fill.
     *
     * @return void Asserts the email prop is an empty string by default.
     * Logic: issue a plain GET to /login and assert the email Inertia prop is ''.
     */
    public function test_login_screen_email_prop_defaults_to_empty_string(): void
    {
        $response = $this->get('/login');

        $response->assertStatus(200);
        $response->assertInertia(
            fn ($page) => $page
                ->component('Auth/Login')
                ->where('email', ''),
        );
    }

    /**
     * Visiting /login?email=...&game=5 stores /dashboard?game=5 as the
     * intended redirect so the user lands on the correct game after login.
     *
     * @return void Asserts the user is redirected to the game dashboard after login.
     * Logic: load the login page with both email and game params to prime the
     *   intended URL in the session, then POST valid credentials and assert
     *   the redirect points to /dashboard?game=5.
     */
    public function test_login_with_game_param_redirects_to_game_dashboard_after_login(): void
    {
        $user = User::factory()->create();

        // Prime the intended URL via the login page visit.
        $this->get('/login?email=' . rawurlencode($user->email) . '&game=5');

        $response = $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect('/dashboard?game=5');
    }
}
