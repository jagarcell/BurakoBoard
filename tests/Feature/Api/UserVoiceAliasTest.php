<?php

namespace Tests\Feature\Api;

use App\Models\User;
use App\Models\UserVoiceAlias;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserVoiceAliasTest extends TestCase
{
    use RefreshDatabase;

    // ── index ─────────────────────────────────────────────────────────────────

    /**
     * Unauthenticated requests to the index endpoint should be rejected.
     *
     * @return void Verifies 401 is returned without a valid Bearer token.
     * Logic: call GET /api/v1/user/voice-aliases without authenticating and assert 401.
     */
    public function test_index_requires_authentication(): void
    {
        $this->getJson('/api/v1/user/voice-aliases')
            ->assertStatus(401);
    }

    /**
     * Authenticated users with no aliases receive an empty list.
     *
     * @return void Verifies the response shape and empty data array.
     * Logic: authenticate a user with no aliases, call GET, assert empty data.data.
     */
    public function test_index_returns_empty_list_for_user_with_no_aliases(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/user/voice-aliases')
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(0, 'data.data');
    }

    /**
     * Index returns only the authenticated user's aliases, not other users'.
     *
     * @return void Verifies ownership scoping and correct resource shape.
     * Logic: create two users each with an alias, authenticate as user A,
     *   assert only user A's alias appears in the response.
     */
    public function test_index_returns_only_the_authenticated_users_aliases(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        UserVoiceAlias::create(['user_id' => $userA->id, 'alias' => 'morocco', 'keyword' => 'burako']);
        UserVoiceAlias::create(['user_id' => $userB->id, 'alias' => 'canada', 'keyword' => 'canastra']);

        Sanctum::actingAs($userA);

        $response = $this->getJson('/api/v1/user/voice-aliases');

        $response
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.alias', 'morocco')
            ->assertJsonPath('data.data.0.keyword', 'burako');
    }

    /**
     * Aliases are returned in alphabetical order.
     *
     * @return void Verifies ordering of the response collection.
     * Logic: seed three out-of-order aliases for a user and assert they are returned sorted.
     */
    public function test_index_returns_aliases_sorted_alphabetically(): void
    {
        $user = User::factory()->create();
        UserVoiceAlias::create(['user_id' => $user->id, 'alias' => 'zebra', 'keyword' => 'z']);
        UserVoiceAlias::create(['user_id' => $user->id, 'alias' => 'apple', 'keyword' => 'a']);
        UserVoiceAlias::create(['user_id' => $user->id, 'alias' => 'mango', 'keyword' => 'm']);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/user/voice-aliases');

        $response
            ->assertOk()
            ->assertJsonPath('data.data.0.alias', 'apple')
            ->assertJsonPath('data.data.1.alias', 'mango')
            ->assertJsonPath('data.data.2.alias', 'zebra');
    }

    /**
     * The resource does not expose user_id or timestamps.
     *
     * @return void Verifies the resource only returns id, alias, and keyword.
     * Logic: create an alias and check the response keys for each item.
     */
    public function test_index_exposes_only_id_alias_and_keyword(): void
    {
        $user = User::factory()->create();
        UserVoiceAlias::create(['user_id' => $user->id, 'alias' => 'morocco', 'keyword' => 'burako']);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/user/voice-aliases');

        $alias = $response->json('data.data.0');
        $this->assertArrayHasKey('id', $alias);
        $this->assertArrayHasKey('alias', $alias);
        $this->assertArrayHasKey('keyword', $alias);
        $this->assertArrayNotHasKey('user_id', $alias);
        $this->assertArrayNotHasKey('created_at', $alias);
        $this->assertArrayNotHasKey('updated_at', $alias);
    }

    // ── store ─────────────────────────────────────────────────────────────────

    /**
     * Unauthenticated requests to the store endpoint should be rejected.
     *
     * @return void Verifies 401 is returned without a valid Bearer token.
     * Logic: POST without authenticating and assert 401.
     */
    public function test_store_requires_authentication(): void
    {
        $this->postJson('/api/v1/user/voice-aliases', ['alias' => 'foo', 'keyword' => 'bar'])
            ->assertStatus(401);
    }

    /**
     * A valid request creates a new alias and returns it with 201.
     *
     * @return void Verifies 201 status, response payload, and database persistence.
     * Logic: authenticate, POST a valid alias/keyword pair, assert the alias is
     *   persisted in the database and the response includes the created record.
     */
    public function test_store_creates_alias_and_returns_201(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/v1/user/voice-aliases', [
            'alias'   => 'Morocco',
            'keyword' => 'Burako',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.alias', 'morocco')
            ->assertJsonPath('data.keyword', 'burako');

        $this->assertDatabaseHas('user_voice_aliases', [
            'user_id' => $user->id,
            'alias'   => 'morocco',
            'keyword' => 'burako',
        ]);
    }

    /**
     * Alias and keyword are normalised to lowercase before persistence.
     *
     * @return void Verifies case normalisation in stored and returned data.
     * Logic: POST uppercase inputs and assert the stored record uses lowercase.
     */
    public function test_store_normalises_alias_and_keyword_to_lowercase(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/user/voice-aliases', [
            'alias'   => 'UPPER CASE',
            'keyword' => 'MiXeD CaSe',
        ])->assertStatus(201);

        $this->assertDatabaseHas('user_voice_aliases', [
            'user_id' => $user->id,
            'alias'   => 'upper case',
            'keyword' => 'mixed case',
        ]);
    }

    /**
     * Duplicate alias for the same user is rejected with 422 and a clear message.
     *
     * @return void Verifies unique validation error is returned.
     * Logic: create an existing alias then try to POST the same alias word again.
     */
    public function test_store_rejects_duplicate_alias_for_same_user(): void
    {
        $user = User::factory()->create();
        UserVoiceAlias::create(['user_id' => $user->id, 'alias' => 'morocco', 'keyword' => 'burako']);

        Sanctum::actingAs($user);

        $this->postJson('/api/v1/user/voice-aliases', [
            'alias'   => 'Morocco',  // different case — still duplicate after normalisation
            'keyword' => 'something else',
        ])->assertStatus(422)
            ->assertJsonPath('data.errors.alias.0', 'You already have an alias for that word.');
    }

    /**
     * Two different users may use the same alias word without conflict.
     *
     * @return void Verifies the unique constraint is scoped to user_id.
     * Logic: user A owns "morocco"; user B posts the same alias — expect 201.
     */
    public function test_store_allows_same_alias_for_different_users(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        UserVoiceAlias::create(['user_id' => $userA->id, 'alias' => 'morocco', 'keyword' => 'burako']);

        Sanctum::actingAs($userB);

        $this->postJson('/api/v1/user/voice-aliases', [
            'alias'   => 'morocco',
            'keyword' => 'burako',
        ])->assertStatus(201);
    }

    /**
     * Missing required fields return 422 validation errors.
     *
     * @return void Verifies both alias and keyword are validated as required.
     * Logic: post empty payload and assert validation errors for both fields.
     */
    public function test_store_validates_required_fields(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/user/voice-aliases', [])
            ->assertStatus(422)
            ->assertJsonPath('data.errors.alias.0', 'The alias field is required.')
            ->assertJsonPath('data.errors.keyword.0', 'The keyword field is required.');
    }

    /**
     * Fields exceeding 100 characters are rejected.
     *
     * @return void Verifies max:100 validation for both alias and keyword.
     * Logic: post strings of 101 characters and assert validation errors.
     */
    public function test_store_validates_field_length(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/user/voice-aliases', [
            'alias'   => str_repeat('a', 101),
            'keyword' => str_repeat('b', 101),
        ])->assertStatus(422)
            ->assertJsonStructure(['data' => ['errors' => ['alias', 'keyword']]]);
    }

    // ── destroy ───────────────────────────────────────────────────────────────

    /**
     * Unauthenticated requests to destroy are rejected.
     *
     * @return void Verifies 401 without authentication.
     * Logic: DELETE without a token and assert 401.
     */
    public function test_destroy_requires_authentication(): void
    {
        $this->deleteJson('/api/v1/user/voice-aliases/1')
            ->assertStatus(401);
    }

    /**
     * Owner can delete their own alias.
     *
     * @return void Verifies 200 response and database deletion.
     * Logic: create an alias, authenticate as the owner, DELETE it, assert it's gone.
     */
    public function test_destroy_deletes_own_alias_and_returns_200(): void
    {
        $user = User::factory()->create();
        $alias = UserVoiceAlias::create(['user_id' => $user->id, 'alias' => 'morocco', 'keyword' => 'burako']);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/v1/user/voice-aliases/{$alias->id}")
            ->assertOk()
            ->assertJsonPath('status', 'success');

        $this->assertDatabaseMissing('user_voice_aliases', ['id' => $alias->id]);
    }

    /**
     * Attempting to delete another user's alias returns 404.
     *
     * @return void Verifies ownership enforcement in the repository.
     * Logic: create an alias owned by user B, authenticate as user A, attempt DELETE,
     *   assert 404 and that the record still exists in the database.
     */
    public function test_destroy_returns_404_when_alias_belongs_to_another_user(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $alias = UserVoiceAlias::create(['user_id' => $userB->id, 'alias' => 'morocco', 'keyword' => 'burako']);

        Sanctum::actingAs($userA);

        $this->deleteJson("/api/v1/user/voice-aliases/{$alias->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('user_voice_aliases', ['id' => $alias->id]);
    }

    /**
     * Attempting to delete a non-existent alias returns 404.
     *
     * @return void Verifies 404 for a missing alias ID.
     * Logic: authenticate as a user and DELETE a non-existent alias ID.
     */
    public function test_destroy_returns_404_for_nonexistent_alias(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->deleteJson('/api/v1/user/voice-aliases/9999')
            ->assertStatus(404);
    }

    // ── cascade delete ────────────────────────────────────────────────────────

    /**
     * Aliases are cascade-deleted when the owning user is deleted.
     *
     * @return void Verifies the ON DELETE CASCADE constraint on the foreign key.
     * Logic: create a user with aliases, delete the user, assert aliases are gone.
     */
    public function test_aliases_are_deleted_when_user_is_deleted(): void
    {
        $user = User::factory()->create();
        UserVoiceAlias::create(['user_id' => $user->id, 'alias' => 'morocco', 'keyword' => 'burako']);

        $userId = $user->id;
        $user->delete();

        $this->assertDatabaseMissing('user_voice_aliases', ['user_id' => $userId]);
    }
}
