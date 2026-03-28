<?php

namespace Tests\Unit\Services;

use App\Models\User;
use App\Repositories\UserRepository;
use App\Services\SocialAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class SocialAuthServiceTest extends TestCase
{
    use RefreshDatabase;

    private SocialAuthService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new SocialAuthService(new UserRepository());
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Build a Socialite user contract mock with the given id, email, and name.
     *
     * @param  string       $id
     * @param  string       $email
     * @param  string|null  $name
     * @return SocialiteUser&MockInterface
     */
    private function makeSocialiteUser(
        string $id,
        string $email,
        ?string $name = 'Test User',
    ): SocialiteUser&MockInterface {
        $mock = Mockery::mock(SocialiteUser::class);
        $mock->shouldReceive('getId')->andReturn($id);
        $mock->shouldReceive('getEmail')->andReturn($email);
        $mock->shouldReceive('getName')->andReturn($name);

        return $mock;
    }

    // -------------------------------------------------------------------------
    // Google — new user
    // -------------------------------------------------------------------------

    public function test_creates_new_google_user_when_no_match_exists(): void
    {
        $socialiteUser = $this->makeSocialiteUser('google-001', 'new@example.com', 'New User');

        $user = $this->service->findOrCreateUser('google', $socialiteUser);

        $this->assertInstanceOf(User::class, $user);
        $this->assertDatabaseHas('users', [
            'email'     => 'new@example.com',
            'google_id' => 'google-001',
        ]);
    }

    // -------------------------------------------------------------------------
    // Apple — new user
    // -------------------------------------------------------------------------

    public function test_creates_new_apple_user_when_no_match_exists(): void
    {
        $socialiteUser = $this->makeSocialiteUser('apple-001', 'apple@example.com', 'Apple User');

        $user = $this->service->findOrCreateUser('apple', $socialiteUser);

        $this->assertInstanceOf(User::class, $user);
        $this->assertDatabaseHas('users', [
            'email'    => 'apple@example.com',
            'apple_id' => 'apple-001',
        ]);
    }

    // -------------------------------------------------------------------------
    // Google — existing user matched by google_id
    // -------------------------------------------------------------------------

    public function test_returns_existing_user_matched_by_google_id(): void
    {
        $existing      = User::factory()->create(['google_id' => 'google-002']);
        $socialiteUser = $this->makeSocialiteUser('google-002', $existing->email);

        $user = $this->service->findOrCreateUser('google', $socialiteUser);

        $this->assertTrue($user->is($existing));
        $this->assertDatabaseCount('users', 1);
    }

    // -------------------------------------------------------------------------
    // Apple — existing user matched by apple_id
    // -------------------------------------------------------------------------

    public function test_returns_existing_user_matched_by_apple_id(): void
    {
        $existing      = User::factory()->create(['apple_id' => 'apple-002']);
        $socialiteUser = $this->makeSocialiteUser('apple-002', $existing->email);

        $user = $this->service->findOrCreateUser('apple', $socialiteUser);

        $this->assertTrue($user->is($existing));
        $this->assertDatabaseCount('users', 1);
    }

    // -------------------------------------------------------------------------
    // Google — email fallback links google_id to existing account
    // -------------------------------------------------------------------------

    public function test_links_google_id_to_existing_email_account(): void
    {
        $existing      = User::factory()->create(['email' => 'shared@example.com', 'google_id' => null]);
        $socialiteUser = $this->makeSocialiteUser('google-003', 'shared@example.com');

        $user = $this->service->findOrCreateUser('google', $socialiteUser);

        $this->assertTrue($user->is($existing));
        $this->assertDatabaseHas('users', [
            'id'        => $existing->id,
            'google_id' => 'google-003',
        ]);
    }

    // -------------------------------------------------------------------------
    // Apple — email fallback links apple_id to existing account
    // -------------------------------------------------------------------------

    public function test_links_apple_id_to_existing_email_account(): void
    {
        $existing      = User::factory()->create(['email' => 'shared@example.com', 'apple_id' => null]);
        $socialiteUser = $this->makeSocialiteUser('apple-003', 'shared@example.com');

        $user = $this->service->findOrCreateUser('apple', $socialiteUser);

        $this->assertTrue($user->is($existing));
        $this->assertDatabaseHas('users', [
            'id'       => $existing->id,
            'apple_id' => 'apple-003',
        ]);
    }

    // -------------------------------------------------------------------------
    // Apple — null name falls back to email local-part
    // -------------------------------------------------------------------------

    public function test_uses_email_local_part_when_name_is_null(): void
    {
        $socialiteUser = $this->makeSocialiteUser('apple-004', 'john@example.com', null);

        $this->service->findOrCreateUser('apple', $socialiteUser);

        $this->assertDatabaseHas('users', [
            'email' => 'john@example.com',
            'name'  => 'john',
        ]);
    }

    // -------------------------------------------------------------------------
    // New user receives a random password (not empty)
    // -------------------------------------------------------------------------

    public function test_new_user_is_created_with_a_hashed_random_password(): void
    {
        $socialiteUser = $this->makeSocialiteUser('google-005', 'random@example.com', 'Random User');

        $this->service->findOrCreateUser('google', $socialiteUser);

        $user = User::where('email', 'random@example.com')->sole();

        $this->assertNotEmpty($user->password);
        $this->assertFalse(Hash::check('', $user->password));
    }

    // -------------------------------------------------------------------------
    // New user has email_verified_at set
    // -------------------------------------------------------------------------

    public function test_new_user_has_email_verified_at_set(): void
    {
        $socialiteUser = $this->makeSocialiteUser('google-006', 'verified@example.com', 'Verified User');

        $this->service->findOrCreateUser('google', $socialiteUser);

        $user = User::where('email', 'verified@example.com')->sole();

        $this->assertNotNull($user->email_verified_at);
    }

    // -------------------------------------------------------------------------
    // Does not create duplicate users
    // -------------------------------------------------------------------------

    public function test_does_not_create_duplicate_users_on_repeated_login(): void
    {
        $socialiteUser = $this->makeSocialiteUser('google-007', 'repeat@example.com', 'Repeat User');

        $this->service->findOrCreateUser('google', $socialiteUser);
        $this->service->findOrCreateUser('google', $socialiteUser);

        $this->assertDatabaseCount('users', 1);
    }
}
