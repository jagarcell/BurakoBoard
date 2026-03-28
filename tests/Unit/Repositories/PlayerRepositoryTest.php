<?php

namespace Tests\Unit\Repositories;

use App\Models\User;
use App\Repositories\PlayerRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PlayerRepositoryTest extends TestCase
{
    use RefreshDatabase;

    private PlayerRepository $repository;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = new PlayerRepository();
        Cache::forget('user_list');
    }

    // -------------------------------------------------------------------------
    // getUserList – caching
    // -------------------------------------------------------------------------

    /**
     * Ensure getUserList() returns all registered users from the database on the first call.
     *
     * @return void Verifies the repository fetches from DB when cache is cold.
     * Logic: create two users, call getUserList() with a clean cache, and assert both rows
     *   are returned ordered by name.
     */
    public function test_get_user_list_returns_users_from_database(): void
    {
        User::factory()->create(['name' => 'Zelda']);
        User::factory()->create(['name' => 'Alice']);

        $result = $this->repository->getUserList();

        $this->assertCount(2, $result);
        $this->assertEquals('Alice', $result->first()->name);
    }

    /**
     * Ensure getUserList() populates the cache on the first call.
     *
     * @return void Verifies the cache key 'user_list' is stored after the first DB fetch.
     * Logic: call getUserList() with a warm database and cold cache, then assert that the
     *   'user_list' key is present in the cache store.
     */
    public function test_get_user_list_populates_cache_on_first_call(): void
    {
        User::factory()->create(['name' => 'Alice']);

        $this->repository->getUserList();

        $this->assertNotNull(Cache::get('user_list'));
    }

    /**
     * Ensure getUserList() does not query the database on a warm-cache call.
     *
     * @return void Verifies the second call is served entirely from the cache.
     * Logic: pre-populate the 'user_list' cache with a fake collection, then call
     *   getUserList() and assert no database queries were executed.
     */
    public function test_get_user_list_skips_database_when_cache_is_warm(): void
    {
        $cached = collect([
            (object) ['id' => 99, 'name' => 'Cached User'],
        ]);

        Cache::put('user_list', $cached);

        DB::enableQueryLog();

        $result = $this->repository->getUserList();

        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $this->assertCount(1, $result);
        $this->assertEquals('Cached User', $result->first()->name);
        $this->assertEmpty($queries, 'No DB queries should be fired when the cache is warm.');
    }
}
