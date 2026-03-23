<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PendingInvitationsIndexTest extends TestCase
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
     * Logic: insert a game with sensible defaults so individual test cases only supply what they care about.
     */
    private function createGame(string $name = 'Test Game'): Game
    {
        return Game::query()->create([
            'name'                          => $name,
            'target_points'                 => 2000,
            'status'                        => 'in_progress',
            'winning_team_id'               => null,
            'current_round_number'          => 0,
            'initial_shuffler_seat_number'  => null,
        ]);
    }

    /**
     * Attach a user to a game with the given role.
     *
     * @param  \App\Models\Game  $game  Game to attach the user to.
     * @param  \App\Models\User  $user  User being attached.
     * @param  string            $role  Role string to assign (creator, viewer, pending_invitee).
     * @return void
     * Logic: direct pivot insert so tests don't couple to the invitation service layer.
     */
    private function attachUserToGame(Game $game, User $user, string $role): void
    {
        $now = now();
        DB::table('game_user')->insert([
            'game_id'    => $game->id,
            'user_id'    => $user->id,
            'role'       => $role,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    // -------------------------------------------------------------------------
    // Authentication
    // -------------------------------------------------------------------------

    /**
     * Ensure the pending invitations endpoint requires authentication.
     *
     * @return void Verifies unauthenticated requests receive a 401 response.
     * Logic: call the endpoint without an authenticated session and assert the Sanctum guard
     *   returns Unauthorized so anonymous callers never receive invitation data.
     */
    public function test_pending_invitations_requires_authentication(): void
    {
        $this->getJson('/api/v1/invitations')->assertUnauthorized();
    }

    // -------------------------------------------------------------------------
    // Happy path
    // -------------------------------------------------------------------------

    /**
     * Ensure only games with a pending_invitee role are returned for the authenticated user.
     *
     * @return void Verifies filtering to pending_invitee rows, ordering, and resource shape.
     * Logic: create three games — one where the user is the creator, one where the user is
     *   a viewer, and one where the user is a pending_invitee — then assert the response
     *   contains only the pending game with the correct shape.
     */
    public function test_returns_only_pending_invitee_games_for_authenticated_user(): void
    {
        $user = User::factory()->create();

        $creatorGame  = $this->createGame('My Own Game');
        $viewerGame   = $this->createGame('Watching Game');
        $pendingGame  = $this->createGame('Invited Game');

        $this->attachUserToGame($creatorGame, $user, 'creator');
        $this->attachUserToGame($viewerGame, $user, 'viewer');
        $this->attachUserToGame($pendingGame, $user, 'pending_invitee');

        $response = $this->actingAs($user)->getJson('/api/v1/invitations');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(1, 'data.invitations')
            ->assertJsonPath('data.invitations.0.name', 'Invited Game')
            ->assertJsonPath('data.invitations.0.user_role', 'pending_invitee');
    }

    /**
     * Ensure multiple pending invitations are all returned, newest first.
     *
     * @return void Verifies count and descending id ordering across two pending games.
     * Logic: create two pending games for the same user and assert both appear in the
     *   response ordered by descending id (the second-created game comes first).
     */
    public function test_returns_multiple_pending_invitations_newest_first(): void
    {
        $user = User::factory()->create();

        $firstGame  = $this->createGame('First Invite');
        $secondGame = $this->createGame('Second Invite');

        $this->attachUserToGame($firstGame, $user, 'pending_invitee');
        $this->attachUserToGame($secondGame, $user, 'pending_invitee');

        $response = $this->actingAs($user)->getJson('/api/v1/invitations');

        $response
            ->assertOk()
            ->assertJsonCount(2, 'data.invitations')
            ->assertJsonPath('data.invitations.0.name', 'Second Invite')
            ->assertJsonPath('data.invitations.1.name', 'First Invite');
    }

    /**
     * Ensure pending invitations from other users are not included in the response.
     *
     * @return void Verifies cross-user isolation for the invitations endpoint.
     * Logic: create a pending invitation for a different user and assert the authenticated
     *   user's response contains only their own pending games.
     */
    public function test_does_not_return_other_users_pending_invitations(): void
    {
        $user  = User::factory()->create();
        $other = User::factory()->create();

        $myPending    = $this->createGame('My Invite');
        $theirPending = $this->createGame('Their Invite');

        $this->attachUserToGame($myPending, $user, 'pending_invitee');
        $this->attachUserToGame($theirPending, $other, 'pending_invitee');

        $response = $this->actingAs($user)->getJson('/api/v1/invitations');

        $response
            ->assertOk()
            ->assertJsonCount(1, 'data.invitations')
            ->assertJsonPath('data.invitations.0.name', 'My Invite');
    }

    /**
     * Ensure the response is an empty list when the user has no pending invitations.
     *
     * @return void Verifies the endpoint returns an empty array, not a 404 or error.
     * Logic: authenticate a user with no game_user pivot rows and assert the invitations
     *   key holds an empty array so the client can reliably iterate without null checks.
     */
    public function test_returns_empty_list_when_no_pending_invitations(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/v1/invitations');

        $response
            ->assertOk()
            ->assertJsonCount(0, 'data.invitations');
    }

    /**
     * Ensure the response shape includes all fields the GameListItemResource exposes.
     *
     * @return void Verifies the resource keys id, name, target_points, status, user_role are present.
     * Logic: create a single pending invitation and assert that all expected resource fields
     *   are present in the first element of the invitations array so the frontend can rely
     *   on a stable contract.
     */
    public function test_response_includes_expected_resource_fields(): void
    {
        $user = User::factory()->create();
        $game = $this->createGame('Resource Shape Game');

        $this->attachUserToGame($game, $user, 'pending_invitee');

        $response = $this->actingAs($user)->getJson('/api/v1/invitations');

        $response
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'invitations' => [
                        '*' => ['id', 'name', 'target_points', 'status', 'user_role'],
                    ],
                ],
            ]);
    }
}
