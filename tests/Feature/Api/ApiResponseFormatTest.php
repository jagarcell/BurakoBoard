<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiResponseFormatTest extends TestCase
{
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
}
