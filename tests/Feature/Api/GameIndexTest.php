<?php

namespace Tests\Feature\Api;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GameIndexTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Ensure the games index requires authentication.
     *
     * @return void Verifies that an unauthenticated request is rejected with 401.
     * Logic: call the index endpoint without a session user and assert the guard returns an
     *   Unauthorized response so the route is never accessible anonymously.
     */
    public function test_games_index_requires_authentication(): void
    {
        $this->getJson('/api/v1/games')->assertUnauthorized();
    }

    /**
     * Ensure the games index returns only games the authenticated user is enrolled in.
     *
     * @return void Verifies filtering by game_user pivot and newest-first ordering.
     * Logic: create two games for the authenticated user and one for a different user,
     *   call the index, and assert only the two user-scoped games are returned in
     *   descending id order.
     */
    public function test_games_index_returns_only_the_authenticated_users_games(): void
    {
        $user  = User::factory()->create();
        $other = User::factory()->create();

        $gameA = Game::query()->create([
            'name'                => 'Opening Table',
            'target_points'       => 1500,
            'status'              => 'in_progress',
            'winning_team_id'     => null,
            'current_round_number' => 0,
        ]);

        $gameB = Game::query()->create([
            'name'                => 'Championship Table',
            'target_points'       => 3000,
            'status'              => 'finished',
            'winning_team_id'     => null,
            'current_round_number' => 5,
        ]);

        $otherGame = Game::query()->create([
            'name'                => 'Other User Game',
            'target_points'       => 2000,
            'status'              => 'in_progress',
            'winning_team_id'     => null,
            'current_round_number' => 0,
        ]);

        $now = now();
        DB::table('game_user')->insert([
            ['game_id' => $gameA->id, 'user_id' => $user->id,  'role' => 'creator', 'created_at' => $now, 'updated_at' => $now],
            ['game_id' => $gameB->id, 'user_id' => $user->id,  'role' => 'viewer',  'created_at' => $now, 'updated_at' => $now],
            ['game_id' => $otherGame->id, 'user_id' => $other->id, 'role' => 'creator', 'created_at' => $now, 'updated_at' => $now],
        ]);

        $response = $this->actingAs($user)->getJson('/api/v1/games');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(2, 'data.games')
            ->assertJsonPath('data.games.0.name', 'Championship Table')
            ->assertJsonPath('data.games.0.target_points', 3000)
            ->assertJsonPath('data.games.0.user_role', 'viewer')
            ->assertJsonPath('data.games.1.name', 'Opening Table')
            ->assertJsonPath('data.games.1.user_role', 'creator');
    }

    /**
     * Ensure the games index returns an empty list when the user has no enrolled games.
     *
     * @return void Verifies an authenticated user with no game_user entries gets an empty array.
     * Logic: authenticate a user who has no pivot rows and assert the games array is empty
     *   rather than leaking other users' games.
     */
    public function test_games_index_returns_empty_list_when_user_has_no_games(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/v1/games')
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(0, 'data.games');
    }

    /**
     * Ensure each game in the index carries the user_role field.
     *
     * @return void Verifies role is exposed correctly for pending_invitee entries.
     * Logic: enrol a user as pending_invitee and assert the user_role field in the response
     *   matches the pivot value so the frontend can render the correct indicator.
     */
    public function test_games_index_includes_user_role_per_game(): void
    {
        $user = User::factory()->create();

        $game = Game::query()->create([
            'name'                => 'Pending Game',
            'target_points'       => 2000,
            'status'              => 'in_progress',
            'winning_team_id'     => null,
            'current_round_number' => 0,
        ]);

        DB::table('game_user')->insert([
            'game_id'    => $game->id,
            'user_id'    => $user->id,
            'role'       => 'pending_invitee',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($user)->getJson('/api/v1/games')
            ->assertOk()
            ->assertJsonPath('data.games.0.user_role', 'pending_invitee');
    }
}
