<?php

namespace Tests\Feature\Api;

use App\Events\GameDeleted;
use App\Models\Game;
use App\Models\Round;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class GameDestroyTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Create a game with default in-progress attributes.
     *
     * @param  array<string, mixed>  $overrides  Attribute overrides for the game record.
     * @return \App\Models\Game The created game.
     * Logic: centralise game creation so each test only specifies the attributes it cares about.
     */
    private function makeGame(array $overrides = []): Game
    {
        return Game::query()->create(array_merge([
            'name'                 => 'Test Game',
            'target_points'        => 2000,
            'status'               => 'in_progress',
            'winning_team_id'      => null,
            'current_round_number' => 0,
        ], $overrides));
    }

    /**
     * Insert a game_user pivot row for the given user and role.
     *
     * @param  int     $gameId  Identifier of the game.
     * @param  int     $userId  Identifier of the user.
     * @param  string  $role    Role to assign: creator, viewer, or pending_invitee.
     * @return void
     * Logic: insert a single raw pivot row so tests avoid booting service-layer dependencies.
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

    /**
     * Ensure that an unauthenticated request to the delete endpoint is rejected.
     *
     * @return void Verifies the sanctum guard returns 401 for guests.
     * Logic: call the DELETE endpoint without any authentication and assert the response is Unauthorized.
     */
    public function test_unauthenticated_user_cannot_delete_a_game(): void
    {
        $game = $this->makeGame();

        $this->deleteJson("/api/v1/games/{$game->id}")->assertUnauthorized();
    }

    /**
     * Ensure a game creator can delete a game that has no recorded rounds.
     *
     * @return void Verifies the game is removed from the database and a 200 response is returned.
     * Logic: create a game with no rounds, act as the creator, call the delete endpoint,
     *   and assert the game row is gone from the database.
     */
    public function test_creator_can_delete_a_game_with_no_rounds(): void
    {
        $user = User::factory()->create();
        $game = $this->makeGame();
        $this->attachUserToGame($game->id, $user->id, 'creator');

        $response = $this->actingAs($user)->deleteJson("/api/v1/games/{$game->id}");

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.game_id', $game->id);

        $this->assertDatabaseMissing('games', ['id' => $game->id]);
    }

    /**
     * Ensure a viewer cannot delete a game they do not own.
     *
     * @return void Verifies the endpoint returns 403 Forbidden for non-creator roles.
     * Logic: attach the user as a viewer and assert the delete endpoint rejects the request.
     */
    public function test_viewer_cannot_delete_a_game(): void
    {
        $user = User::factory()->create();
        $game = $this->makeGame();
        $this->attachUserToGame($game->id, $user->id, 'viewer');

        $this->actingAs($user)->deleteJson("/api/v1/games/{$game->id}")->assertForbidden();

        $this->assertDatabaseHas('games', ['id' => $game->id]);
    }

    /**
     * Ensure a pending invitee cannot delete a game.
     *
     * @return void Verifies the endpoint returns 403 Forbidden for pending_invitee roles.
     * Logic: attach the user as a pending_invitee and assert the delete endpoint is rejected.
     */
    public function test_pending_invitee_cannot_delete_a_game(): void
    {
        $user = User::factory()->create();
        $game = $this->makeGame();
        $this->attachUserToGame($game->id, $user->id, 'pending_invitee');

        $this->actingAs($user)->deleteJson("/api/v1/games/{$game->id}")->assertForbidden();

        $this->assertDatabaseHas('games', ['id' => $game->id]);
    }

    /**
     * Ensure a creator cannot delete a game that already has recorded rounds.
     *
     * @return void Verifies the endpoint returns 422 with a descriptive error message.
     * Logic: insert a round row for the game, then attempt deletion and assert a validation error is returned.
     */
    public function test_creator_cannot_delete_a_game_with_recorded_rounds(): void
    {
        $user = User::factory()->create();
        $game = $this->makeGame(['current_round_number' => 1]);
        $this->attachUserToGame($game->id, $user->id, 'creator');

        Round::query()->create(['game_id' => $game->id, 'round_number' => 1]);

        $response = $this->actingAs($user)->deleteJson("/api/v1/games/{$game->id}");

        $response
            ->assertUnprocessable()
            ->assertJsonPath('status', 'error');

        $this->assertDatabaseHas('games', ['id' => $game->id]);
    }

    /**
     * Ensure deleting a non-existent game returns a 404 response.
     *
     * @return void Verifies the endpoint handles missing game ids gracefully.
     * Logic: authenticate a user and request deletion of a game id that does not exist in the database.
     */
    public function test_delete_returns_404_for_missing_game(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->deleteJson('/api/v1/games/99999')->assertNotFound();
    }

    /**
     * Ensure deleting a game cascades to the game_user pivot rows.
     *
     * @return void Verifies that pivot data linked to the game is removed automatically.
     * Logic: create a game with a creator pivot row, delete the game, and assert the game_user
     *   row is gone so no orphaned pivot entries remain.
     */
    public function test_deleting_a_game_removes_its_pivot_rows(): void
    {
        $user = User::factory()->create();
        $game = $this->makeGame();
        $this->attachUserToGame($game->id, $user->id, 'creator');

        $this->actingAs($user)->deleteJson("/api/v1/games/{$game->id}")->assertOk();

        $this->assertDatabaseMissing('game_user', [
            'game_id' => $game->id,
            'user_id' => $user->id,
        ]);
    }

    /**
     * Ensure the GameDeleted broadcast event is dispatched when a creator deletes a game.
     *
     * @return void Verifies that the event is dispatched with the correct game ID.
     * Logic: fake the Event facade, act as the creator, delete the game, and assert
     *   GameDeleted was dispatched with the matching game_id so all other connected
     *   clients can reset their dropdowns in real time.
     */
    public function test_game_deleted_event_is_dispatched_when_creator_deletes_game(): void
    {
        Event::fake([GameDeleted::class]);

        $user = User::factory()->create();
        $game = $this->makeGame();
        $this->attachUserToGame($game->id, $user->id, 'creator');

        $this->actingAs($user)->deleteJson("/api/v1/games/{$game->id}")->assertOk();

        Event::assertDispatched(GameDeleted::class, function (GameDeleted $event) use ($game): bool {
            return $event->gameId === $game->id;
        });
    }

    /**
     * Ensure the GameDeleted event is NOT dispatched when the deletion is rejected.
     *
     * @return void Verifies no broadcast fires on a failed delete attempt.
     * Logic: fake the Event facade, attempt deletion as a viewer (rejected with 403),
     *   and assert no GameDeleted event was dispatched.
     */
    public function test_game_deleted_event_is_not_dispatched_on_failed_deletion(): void
    {
        Event::fake([GameDeleted::class]);

        $user = User::factory()->create();
        $game = $this->makeGame();
        $this->attachUserToGame($game->id, $user->id, 'viewer');

        $this->actingAs($user)->deleteJson("/api/v1/games/{$game->id}")->assertForbidden();

        Event::assertNotDispatched(GameDeleted::class);
    }
}
