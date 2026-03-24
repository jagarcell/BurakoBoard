<?php

namespace Tests\Feature\Auth;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    /**
     * Visiting /login?email=...&game=X stores the game ID in the session so
     * the post-login handler can auto-accept the invitation.
     *
     * @return void Asserts invitation_game_id is present in the session after the login page visit.
     * Logic: issue a GET to the login route with both email and game params and assert
     *   that the session contains the invitation_game_id key set to the game's integer ID.
     */
    public function test_login_page_with_game_param_stores_invitation_game_id_in_session(): void
    {
        $response = $this->get('/login?email=invited%40example.com&game=42');

        $response->assertSessionHas('invitation_game_id', 42);
    }

    /**
     * Logging in via an invitation link auto-accepts the pending invitation,
     * upgrading the user's role from pending_invitee to viewer.
     *
     * @return void Asserts the game_user role is updated to viewer after login.
     * Logic: create a game, attach the user as pending_invitee, visit the login
     *   page with the game ID in the query string to prime the session, POST
     *   valid credentials, then assert the pivot row holds the viewer role.
     */
    public function test_login_via_invitation_link_auto_accepts_pending_invitation(): void
    {
        $user = User::factory()->create();

        $game = Game::query()->create([
            'name'                         => 'Test Game',
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

        // Prime the session with the invitation game ID.
        $this->get('/login?email=' . rawurlencode($user->email) . '&game=' . $game->id);

        $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $this->assertDatabaseHas('game_user', [
            'game_id' => $game->id,
            'user_id' => $user->id,
            'role'    => 'viewer',
        ]);
    }

    /**
     * Logging in without a matching pending invitation does not cause an error.
     *
     * @return void Asserts login completes normally when no pending invitation exists.
     * Logic: visit the login page with a non-existent game ID in the query string,
     *   POST valid credentials, and confirm the user is authenticated and redirected
     *   without any exception being raised.
     */
    public function test_login_via_invitation_link_without_pending_invitation_succeeds_silently(): void
    {
        $user = User::factory()->create();

        // Use a game ID that doesn't exist in game_user.
        $this->get('/login?email=' . rawurlencode($user->email) . '&game=9999');

        $response = $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect('/dashboard?game=9999');
    }
}
