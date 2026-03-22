<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class InvitableUsersIndexTest extends TestCase
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
     * Logic: insert a game with sensible defaults so individual test cases only need to supply the game name.
     */
    private function createGame(string $name = 'Test Game'): Game
    {
        return Game::query()->create([
            'name'                       => $name,
            'target_points'              => 2000,
            'status'                     => 'in_progress',
            'winning_team_id'            => null,
            'current_round_number'       => 0,
            'initial_shuffler_seat_number' => null,
        ]);
    }

    /**
     * Attach a user to a game with a given role via the pivot table.
     *
     * @param  int     $gameId  Identifier of the game.
     * @param  int     $userId  Identifier of the user.
     * @param  string  $role    Role to assign: creator, pending_invitee, or viewer.
     * @return void
     * Logic: insert one pivot row with timestamps so tests can set up any game membership scenario.
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
     * Ensure the invitable-users endpoint requires authentication.
     *
     * @return void Verifies unauthenticated requests are rejected with 401.
     * Logic: call the endpoint without an authenticated session and assert the Sanctum guard
     *   returns an Unauthorized response so anonymous callers cannot enumerate users.
     */
    public function test_invitable_users_endpoint_requires_authentication(): void
    {
        $game = $this->createGame();

        $this->getJson("/api/v1/games/{$game->id}/invitable-users")
            ->assertUnauthorized();
    }

    // -------------------------------------------------------------------------
    // Core filtering
    // -------------------------------------------------------------------------

    /**
     * Ensure the endpoint excludes the authenticated user from the results.
     *
     * @return void Verifies the requesting user never appears in the response payload.
     * Logic: create two users, authenticate as one, and assert the response contains only the other user.
     */
    public function test_authenticated_user_is_excluded_from_results(): void
    {
        $authUser  = User::factory()->create(['name' => 'Alice', 'email' => 'alice@example.com']);
        $otherUser = User::factory()->create(['name' => 'Bob', 'email' => 'bob@example.com']);
        $game      = $this->createGame();

        $response = $this->actingAs($authUser)->getJson("/api/v1/games/{$game->id}/invitable-users");

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(1, 'data.users.data')
            ->assertJsonPath('data.users.data.0.name', 'Bob');

        $names = collect($response->json('data.users.data'))->pluck('name');
        $this->assertNotContains('Alice', $names);
    }

    /**
     * Ensure users with a pending_invitee role for the game are excluded.
     *
     * @return void Verifies that existing pending invitees do not appear in the list.
     * Logic: create three users, give one a pending_invitee pivot entry, authenticate as a second,
     *   and assert only the third user without a pending invite appears in the response.
     */
    public function test_users_with_pending_invite_for_the_game_are_excluded(): void
    {
        $authUser    = User::factory()->create(['name' => 'Creator', 'email' => 'creator@example.com']);
        $pendingUser = User::factory()->create(['name' => 'Pending', 'email' => 'pending@example.com']);
        $freeUser    = User::factory()->create(['name' => 'Free', 'email' => 'free@example.com']);
        $game        = $this->createGame();

        $this->attachUserToGame($game->id, $authUser->id, 'creator');
        $this->attachUserToGame($game->id, $pendingUser->id, 'pending_invitee');

        $response = $this->actingAs($authUser)->getJson("/api/v1/games/{$game->id}/invitable-users");

        $response
            ->assertOk()
            ->assertJsonCount(1, 'data.users.data')
            ->assertJsonPath('data.users.data.0.name', 'Free');

        $names = collect($response->json('data.users.data'))->pluck('name');
        $this->assertNotContains('Pending', $names);
        $this->assertNotContains('Creator', $names);
    }

    /**
     * Ensure users with a viewer role for the game are still included in the list.
     *
     * @return void Verifies that only pending_invitee status causes exclusion, not viewer.
     * Logic: attach one user as a viewer and assert they still appear in the invitable list
     *   so a creator can send a fresh invite if needed.
     */
    public function test_users_with_viewer_role_are_included_in_results(): void
    {
        $authUser   = User::factory()->create(['name' => 'Creator', 'email' => 'creator@example.com']);
        $viewerUser = User::factory()->create(['name' => 'Viewer', 'email' => 'viewer@example.com']);
        $game       = $this->createGame();

        $this->attachUserToGame($game->id, $authUser->id, 'creator');
        $this->attachUserToGame($game->id, $viewerUser->id, 'viewer');

        $response = $this->actingAs($authUser)->getJson("/api/v1/games/{$game->id}/invitable-users");

        $response->assertOk();

        $names = collect($response->json('data.users.data'))->pluck('name');
        $this->assertContains('Viewer', $names);
    }

    /**
     * Ensure the pending_invitee filter is scoped to the requested game only.
     *
     * @return void Verifies that a user's pending invite in a different game does not exclude them.
     * Logic: create two games, give a user a pending_invitee entry in the second game only,
     *   and assert that user still appears when querying the first game's invitable list.
     */
    public function test_pending_invite_exclusion_is_scoped_to_the_requested_game(): void
    {
        $authUser    = User::factory()->create(['name' => 'Creator', 'email' => 'creator@example.com']);
        $pendingUser = User::factory()->create(['name' => 'Pending Elsewhere', 'email' => 'pending@example.com']);
        $gameA       = $this->createGame('Game A');
        $gameB       = $this->createGame('Game B');

        $this->attachUserToGame($gameB->id, $pendingUser->id, 'pending_invitee');

        $response = $this->actingAs($authUser)->getJson("/api/v1/games/{$gameA->id}/invitable-users");

        $response->assertOk();

        $names = collect($response->json('data.users.data'))->pluck('name');
        $this->assertContains('Pending Elsewhere', $names);
    }

    // -------------------------------------------------------------------------
    // Ordering
    // -------------------------------------------------------------------------

    /**
     * Ensure results are returned in alphabetical order by name.
     *
     * @return void Verifies the alphabetical sort.
     * Logic: create users in a deliberately random name order and assert the endpoint returns them
     *   sorted A-to-Z so the invite dialog is predictably ordered.
     */
    public function test_results_are_ordered_alphabetically_by_name(): void
    {
        $authUser = User::factory()->create(['name' => 'Creator', 'email' => 'creator@example.com']);
        User::factory()->create(['name' => 'Zara', 'email' => 'zara@example.com']);
        User::factory()->create(['name' => 'Ana',  'email' => 'ana@example.com']);
        User::factory()->create(['name' => 'Mike', 'email' => 'mike@example.com']);
        $game = $this->createGame();

        $response = $this->actingAs($authUser)->getJson("/api/v1/games/{$game->id}/invitable-users");

        $response->assertOk();

        $names = $response->json('data.users.data.*.name');
        $this->assertSame(['Ana', 'Mike', 'Zara'], $names);
    }

    // -------------------------------------------------------------------------
    // Response shape
    // -------------------------------------------------------------------------

    /**
     * Ensure the response exposes only id and name for each user.
     *
     * @return void Verifies sensitive fields are not leaked.
     * Logic: create a second user and assert the response payload contains exactly id and name
     *   without email, password, or any other sensitive attribute.
     */
    public function test_response_exposes_only_id_and_name(): void
    {
        $authUser  = User::factory()->create(['name' => 'Creator', 'email' => 'creator@example.com']);
        $otherUser = User::factory()->create(['name' => 'Bob',     'email' => 'bob@example.com']);
        $game      = $this->createGame();

        $response = $this->actingAs($authUser)->getJson("/api/v1/games/{$game->id}/invitable-users");

        $response->assertOk();

        $firstUser = $response->json('data.users.data.0');

        $this->assertArrayHasKey('id', $firstUser);
        $this->assertArrayHasKey('name', $firstUser);
        $this->assertArrayNotHasKey('email', $firstUser);
        $this->assertArrayNotHasKey('password', $firstUser);
    }

    // -------------------------------------------------------------------------
    // Pagination
    // -------------------------------------------------------------------------

    /**
     * Ensure the response includes pagination metadata.
     *
     * @return void Verifies useful pagination fields are present in the response.
     * Logic: create enough users to occupy at least one page, call the endpoint, and assert
     *   current_page, last_page, and total are present in the meta block.
     */
    public function test_response_includes_pagination_metadata(): void
    {
        $authUser = User::factory()->create(['name' => 'Creator', 'email' => 'creator@example.com']);
        User::factory()->count(3)->sequence(
            ['name' => 'User A', 'email' => 'a@example.com'],
            ['name' => 'User B', 'email' => 'b@example.com'],
            ['name' => 'User C', 'email' => 'c@example.com'],
        )->create();
        $game = $this->createGame();

        $response = $this->actingAs($authUser)->getJson("/api/v1/games/{$game->id}/invitable-users");

        $response
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'users' => [
                        'data',
                        'meta' => ['current_page', 'last_page', 'total', 'per_page'],
                        'links',
                    ],
                ],
            ]);
    }

    /**
     * Ensure the page query parameter advances through paginated results.
     *
     * @return void Verifies that requesting page 2 returns the correct next set of users.
     * Logic: create 11 users (one more than the default per-page of 10) so two pages exist,
     *   request page 2, and assert exactly one user is returned on the second page.
     */
    public function test_requesting_page_2_returns_second_page_of_results(): void
    {
        $authUser = User::factory()->create(['name' => 'Creator', 'email' => 'creator@example.com']);

        foreach (range(1, 11) as $i) {
            User::factory()->create([
                'name'  => "User {$i}",
                'email' => "user{$i}@example.com",
            ]);
        }

        $game = $this->createGame();

        $response = $this->actingAs($authUser)->getJson("/api/v1/games/{$game->id}/invitable-users?page=2");

        $response
            ->assertOk()
            ->assertJsonPath('data.users.meta.current_page', 2)
            ->assertJsonCount(1, 'data.users.data');
    }

    /**
     * Ensure an empty list is returned when no invitable users exist for the game.
     *
     * @return void Verifies a clean empty response when all users are already pending invitees.
     * Logic: create only the authenticated user and one user already holding a pending invite,
     *   then assert the invitable list is empty.
     */
    public function test_returns_empty_list_when_no_invitable_users_exist(): void
    {
        $authUser    = User::factory()->create(['name' => 'Creator', 'email' => 'creator@example.com']);
        $pendingUser = User::factory()->create(['name' => 'Pending', 'email' => 'pending@example.com']);
        $game        = $this->createGame();

        $this->attachUserToGame($game->id, $pendingUser->id, 'pending_invitee');

        $response = $this->actingAs($authUser)->getJson("/api/v1/games/{$game->id}/invitable-users");

        $response
            ->assertOk()
            ->assertJsonCount(0, 'data.users.data');
    }
}
