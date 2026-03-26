<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserIndexTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    /**
     * Boot a shared authenticated user for each test without persisting it.
     *
     * @return void
     * Logic: use make() instead of create() so the auth user is not counted in the
     *   users table, preserving tests that assert exact user counts.
     */
    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->make();
        $this->actingAs($this->user);
    }

    /**
     * Ensure the users index returns an empty list when no users exist.
     *
     * @return void Verifies the endpoint returns an empty array for a fresh database.
     * Logic: call the endpoint with no users seeded and assert the data array is empty.
     */
    public function test_users_index_returns_empty_list_when_no_users_exist(): void
    {
        $response = $this->getJson('/api/v1/users');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(0, 'data.users');
    }

    /**
     * Ensure the users index returns registered users ordered by name.
     *
     * @return void Verifies user list payload and alphabetical ordering.
     * Logic: create users with out-of-order names, call the endpoint, and assert they are returned alphabetically with only id and name exposed.
     */
    public function test_users_index_returns_registered_users_ordered_by_name(): void
    {
        User::factory()->create(['name' => 'Zelda', 'email' => 'zelda@example.com']);
        User::factory()->create(['name' => 'Alice', 'email' => 'alice@example.com']);
        User::factory()->create(['name' => 'Marcus', 'email' => 'marcus@example.com']);

        $response = $this->getJson('/api/v1/users');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(3, 'data.users')
            ->assertJsonPath('data.users.0.name', 'Alice')
            ->assertJsonPath('data.users.1.name', 'Marcus')
            ->assertJsonPath('data.users.2.name', 'Zelda');
    }

    /**
     * Ensure the users index does not expose sensitive user fields.
     *
     * @return void Verifies only id and name are present in each user payload.
     * Logic: create a user and assert the response contains only the allowed fields without email or password.
     */
    public function test_users_index_exposes_only_id_and_name(): void
    {
        $user = User::factory()->create(['name' => 'Carlos', 'email' => 'carlos@example.com']);

        $response = $this->getJson('/api/v1/users');

        $response
            ->assertOk()
            ->assertJsonPath('data.users.0.id', $user->id)
            ->assertJsonPath('data.users.0.name', 'Carlos');

        $this->assertArrayNotHasKey('email', $response->json('data.users.0'));
        $this->assertArrayNotHasKey('password', $response->json('data.users.0'));
    }
}
