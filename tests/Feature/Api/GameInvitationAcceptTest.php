<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GameInvitationAcceptTest extends TestCase
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
     * Ensure the accept-invitation endpoint requires authentication.
     *
     * @return void Verifies the Sanctum guard rejects unauthenticated requests with 401.
     * Logic: call the PUT endpoint without a session and assert it returns Unauthorized.
     */
    public function test_unauthenticated_request_is_rejected(): void
    {
        $game = $this->createGame();

        $this->putJson("/api/v1/games/{$game->id}/invitation")
            ->assertUnauthorized();
    }

    // -------------------------------------------------------------------------
    // Happy path
    // -------------------------------------------------------------------------

    /**
     * Verify that a pending_invitee can accept the invitation and be promoted to viewer.
     *
     * @return void Asserts the pivot role is updated to viewer and the response carries user_role=viewer.
     * Logic: create a game with a pending_invitee, accept via PUT, and assert the pivot row
     *   has been updated to viewer and the response payload reflects the new role.
     */
    public function test_pending_invitee_can_accept_invitation(): void
    {
        $invitee = User::factory()->create();
        $game    = $this->createGame();
        $this->attachUserToGame($game->id, $invitee->id, 'pending_invitee');

        $this->actingAs($invitee)
            ->putJson("/api/v1/games/{$game->id}/invitation")
            ->assertOk()
            ->assertJsonPath('data.game.user_role', 'viewer')
            ->assertJsonPath('data.game.id', $game->id);

        $this->assertDatabaseHas('game_user', [
            'game_id' => $game->id,
            'user_id' => $invitee->id,
            'role'    => 'viewer',
        ]);
    }

    /**
     * Verify that accepting an invitation returns a JsonResource payload
     * containing the standard game list-item fields.
     *
     * @return void Asserts the response includes id, name, target_points, status, and user_role.
     * Logic: accept a pending invitation and check the response structure matches the
     *   GameListItemResource output so the frontend can update its game list in-place.
     */
    public function test_response_contains_expected_game_fields(): void
    {
        $invitee = User::factory()->create();
        $game    = $this->createGame('My Test Game');
        $this->attachUserToGame($game->id, $invitee->id, 'pending_invitee');

        $this->actingAs($invitee)
            ->putJson("/api/v1/games/{$game->id}/invitation")
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'game' => [
                        'id',
                        'name',
                        'target_points',
                        'status',
                        'winning_team_id',
                        'current_round_number',
                        'user_role',
                    ],
                ],
            ]);
    }

    // -------------------------------------------------------------------------
    // Error paths
    // -------------------------------------------------------------------------

    /**
     * Ensure the endpoint returns 404 when the game does not exist.
     *
     * @return void Asserts a 404 response is returned for an unknown game ID.
     * Logic: call the endpoint with a non-existent game id and assert the model-not-found
     *   exception is translated to a 404 HTTP response.
     */
    public function test_returns_404_when_game_does_not_exist(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/v1/games/99999/invitation')
            ->assertNotFound();
    }

    /**
     * Ensure a user who has no pivot row (not invited) receives a validation error.
     *
     * @return void Asserts a 422 response with an invitation error key.
     * Logic: act as a user with no game_user row for this game and assert the service
     *   raises a ValidationException that is serialized as an unprocessable response.
     */
    public function test_non_invited_user_receives_validation_error(): void
    {
        $user = User::factory()->create();
        $game = $this->createGame();

        $this->actingAs($user)
            ->putJson("/api/v1/games/{$game->id}/invitation")
            ->assertUnprocessable()
            ->assertJsonPath('status', 'error')
            ->assertJsonStructure(['data' => ['errors' => ['invitation']]]);
    }

    /**
     * Ensure a user who is already a viewer cannot re-accept the invitation.
     *
     * @return void Asserts a 422 response is returned when the user is already a viewer.
     * Logic: attach the user as a viewer and call the accept endpoint; since no
     *   pending_invitee row exists the service should reject with a validation error.
     */
    public function test_existing_viewer_cannot_accept_again(): void
    {
        $viewer = User::factory()->create();
        $game   = $this->createGame();
        $this->attachUserToGame($game->id, $viewer->id, 'viewer');

        $this->actingAs($viewer)
            ->putJson("/api/v1/games/{$game->id}/invitation")
            ->assertUnprocessable()
            ->assertJsonPath('status', 'error')
            ->assertJsonStructure(['data' => ['errors' => ['invitation']]]);
    }

    /**
     * Ensure the game creator cannot use the accept-invitation endpoint for their own game.
     *
     * @return void Asserts a 422 response is returned when a creator calls the accept endpoint.
     * Logic: attach the user as creator and call the accept endpoint; no pending_invitee
     *   row exists so the service rejects the request with a validation error.
     */
    public function test_creator_cannot_accept_own_game_invitation(): void
    {
        $creator = User::factory()->create();
        $game    = $this->createGame();
        $this->attachUserToGame($game->id, $creator->id, 'creator');

        $this->actingAs($creator)
            ->putJson("/api/v1/games/{$game->id}/invitation")
            ->assertUnprocessable()
            ->assertJsonPath('status', 'error')
            ->assertJsonStructure(['data' => ['errors' => ['invitation']]]);
    }

    /**
     * Ensure the pivot row is NOT modified when the accept request fails because
     * the user was already a viewer.
     *
     * @return void Asserts the database role column remains 'viewer' after the rejected call.
     * Logic: call the accept endpoint as an already-enrolled viewer, assert the request fails,
     *   and confirm the database row is unchanged.
     */
    public function test_pivot_role_unchanged_when_user_is_already_viewer(): void
    {
        $viewer = User::factory()->create();
        $game   = $this->createGame();
        $this->attachUserToGame($game->id, $viewer->id, 'viewer');

        $this->actingAs($viewer)
            ->putJson("/api/v1/games/{$game->id}/invitation")
            ->assertUnprocessable();

        $this->assertDatabaseHas('game_user', [
            'game_id' => $game->id,
            'user_id' => $viewer->id,
            'role'    => 'viewer',
        ]);
    }
}
