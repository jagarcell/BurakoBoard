<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiResponseFormatTest extends TestCase
{
    use RefreshDatabase;
    /**
     * Ensure the health endpoint returns the standard API response envelope.
     *
     * @return void
     */
    public function test_health_endpoint_returns_consistent_response_envelope(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response
            ->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data',
                'meta',
                'links',
                'http_code',
            ])
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.health', 'ok')
            ->assertJsonPath('meta.version', 'v1')
            ->assertJsonPath('http_code', 200);
    }

    /**
     * Ensure the authenticated user endpoint returns the standard API response envelope.
     *
     * @return void
     */
    public function test_authenticated_user_endpoint_returns_consistent_response_envelope(): void
    {
        $user = User::factory()->make();
        $user->id = 1;

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/user');

        $response
            ->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => ['user' => ['id', 'name', 'email']],
                'meta',
                'links',
                'http_code',
            ])
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('meta.version', 'v1')
            ->assertJsonPath('http_code', 200);
    }

    /**
     * A 404 JSON error response always contains both message and errors keys inside data.
     *
     * @return void Asserts the standardised error shape for a not-found API request.
     * Logic: request a non-existent game resource and verify the envelope contains
     *   data.message (string) and data.errors (present, empty object).
     */
    public function test_404_error_response_has_consistent_shape(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/games/99999')
            ->assertNotFound()
            ->assertJsonPath('status', 'error')
            ->assertJsonPath('data.message', 'The requested resource was not found.')
            ->assertJsonPath('http_code', 404)
            ->assertJsonStructure(['data' => ['message', 'errors']]);
    }

    /**
     * A 403 JSON error response always contains both message and errors keys inside data.
     *
     * @return void Asserts the standardised error shape for an authorisation failure.
     * Logic: create a game owned by one user, attempt to delete it as a different user,
     *   and verify the envelope always contains data.message and data.errors.
     */
    public function test_403_error_response_has_consistent_shape(): void
    {
        $owner    = User::factory()->create();
        $attacker = User::factory()->create();

        Sanctum::actingAs($owner);
        $gameResponse = $this->postJson('/api/v1/games', [
            'name'          => 'Owner Game',
            'target_points' => 2000,
        ]);
        $gameId = $gameResponse->json('data.game.game.id');

        Sanctum::actingAs($attacker);
        $this->deleteJson("/api/v1/games/{$gameId}")
            ->assertForbidden()
            ->assertJsonPath('status', 'error')
            ->assertJsonPath('http_code', 403)
            ->assertJsonStructure(['data' => ['message', 'errors']]);
    }
}
