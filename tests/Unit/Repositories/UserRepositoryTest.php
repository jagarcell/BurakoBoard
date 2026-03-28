<?php

namespace Tests\Unit\Repositories;

use App\Models\User;
use App\Repositories\UserRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserRepositoryTest extends TestCase
{
    use RefreshDatabase;

    private UserRepository $repository;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = new UserRepository();
    }

    // -------------------------------------------------------------------------
    // findByProviderId
    // -------------------------------------------------------------------------

    public function test_find_by_provider_id_returns_user_when_match_exists(): void
    {
        $user = User::factory()->create(['google_id' => 'gid-001']);

        $result = $this->repository->findByProviderId('google_id', 'gid-001');

        $this->assertInstanceOf(User::class, $result);
        $this->assertTrue($result->is($user));
    }

    public function test_find_by_provider_id_returns_null_when_no_match(): void
    {
        $result = $this->repository->findByProviderId('google_id', 'nonexistent');

        $this->assertNull($result);
    }

    public function test_find_by_provider_id_works_with_apple_id_column(): void
    {
        $user = User::factory()->create(['apple_id' => 'aid-001']);

        $result = $this->repository->findByProviderId('apple_id', 'aid-001');

        $this->assertTrue($result->is($user));
    }

    // -------------------------------------------------------------------------
    // findByEmail
    // -------------------------------------------------------------------------

    public function test_find_by_email_returns_user_when_match_exists(): void
    {
        $user = User::factory()->create(['email' => 'found@example.com']);

        $result = $this->repository->findByEmail('found@example.com');

        $this->assertInstanceOf(User::class, $result);
        $this->assertTrue($result->is($user));
    }

    public function test_find_by_email_returns_null_when_no_match(): void
    {
        $result = $this->repository->findByEmail('missing@example.com');

        $this->assertNull($result);
    }

    // -------------------------------------------------------------------------
    // attachProviderId
    // -------------------------------------------------------------------------

    public function test_attach_provider_id_writes_google_id_to_user(): void
    {
        $user = User::factory()->create(['google_id' => null]);

        $this->repository->attachProviderId($user, 'google_id', 'gid-002');

        $this->assertDatabaseHas('users', [
            'id'        => $user->id,
            'google_id' => 'gid-002',
        ]);
    }

    public function test_attach_provider_id_writes_apple_id_to_user(): void
    {
        $user = User::factory()->create(['apple_id' => null]);

        $this->repository->attachProviderId($user, 'apple_id', 'aid-002');

        $this->assertDatabaseHas('users', [
            'id'       => $user->id,
            'apple_id' => 'aid-002',
        ]);
    }

    public function test_attach_provider_id_does_not_affect_other_columns(): void
    {
        $user = User::factory()->create([
            'email'     => 'preserve@example.com',
            'google_id' => null,
        ]);

        $this->repository->attachProviderId($user, 'google_id', 'gid-003');

        $this->assertDatabaseHas('users', [
            'id'    => $user->id,
            'email' => 'preserve@example.com',
        ]);
    }

    // -------------------------------------------------------------------------
    // createFromProvider
    // -------------------------------------------------------------------------

    public function test_create_from_provider_inserts_new_user_row(): void
    {
        $user = $this->repository->createFromProvider(
            'google_id',
            'gid-010',
            'new@example.com',
            'New User',
        );

        $this->assertInstanceOf(User::class, $user);
        $this->assertDatabaseHas('users', [
            'email'     => 'new@example.com',
            'name'      => 'New User',
            'google_id' => 'gid-010',
        ]);
    }

    public function test_create_from_provider_sets_email_verified_at(): void
    {
        $user = $this->repository->createFromProvider(
            'google_id',
            'gid-011',
            'verified@example.com',
            'V User',
        );

        $this->assertNotNull($user->email_verified_at);
    }

    public function test_create_from_provider_stores_a_hashed_random_password(): void
    {
        $user = $this->repository->createFromProvider(
            'google_id',
            'gid-012',
            'pwd@example.com',
            'Pwd User',
        );

        $dbUser = User::where('email', 'pwd@example.com')->sole();

        $this->assertNotEmpty($dbUser->password);
        $this->assertFalse(Hash::check('', $dbUser->password));
    }

    public function test_create_from_provider_works_with_apple_id_column(): void
    {
        $user = $this->repository->createFromProvider(
            'apple_id',
            'aid-010',
            'apple@example.com',
            'Apple User',
        );

        $this->assertDatabaseHas('users', [
            'email'    => 'apple@example.com',
            'apple_id' => 'aid-010',
        ]);
    }
}
