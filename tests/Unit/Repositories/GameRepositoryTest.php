<?php

namespace Tests\Unit\Repositories;

use App\Models\BaseElement;
use App\Repositories\GameRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GameRepositoryTest extends TestCase
{
    use RefreshDatabase;

    private GameRepository $repository;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = new GameRepository();
        Cache::forget('base_elements');
    }

    // -------------------------------------------------------------------------
    // getBaseElements – caching
    // -------------------------------------------------------------------------

    /**
     * Ensure getBaseElements() returns the base elements catalogue from the database on the first call.
     *
     * @return void Verifies the repository fetches from DB when cache is cold.
     * Logic: seed two base elements, call getBaseElements() with a clean cache, and assert both
     *   rows are returned with the expected field values.
     */
    public function test_get_base_elements_returns_elements_from_database(): void
    {
        BaseElement::create([
            'name'       => 'burako',
            'label'      => 'Burako',
            'points'     => 100,
            'penalty'    => 100,
            'input_type' => 'boolean',
        ]);

        BaseElement::create([
            'name'       => 'clean_canastra',
            'label'      => 'Clean Canastra',
            'points'     => 200,
            'penalty'    => 0,
            'input_type' => 'quantity',
        ]);

        $result = $this->repository->getBaseElements();

        $this->assertCount(2, $result);
        $this->assertEquals('burako', $result->first()->name);
    }

    /**
     * Ensure getBaseElements() populates the cache on the first call.
     *
     * @return void Verifies the cache key 'base_elements' is stored after the first DB fetch.
     * Logic: call getBaseElements() with a warm database and cold cache, then assert that the
     *   'base_elements' key is present in the cache store.
     */
    public function test_get_base_elements_populates_cache_on_first_call(): void
    {
        BaseElement::create([
            'name'       => 'burako',
            'label'      => 'Burako',
            'points'     => 100,
            'penalty'    => 0,
            'input_type' => 'boolean',
        ]);

        $this->repository->getBaseElements();

        $this->assertNotNull(Cache::get('base_elements'));
    }

    /**
     * Ensure getBaseElements() does not query the database on a warm-cache call.
     *
     * @return void Verifies the second call is served entirely from the cache.
     * Logic: pre-populate the 'base_elements' cache with a fake collection, then call
     *   getBaseElements() and assert no database queries were executed.
     */
    public function test_get_base_elements_skips_database_when_cache_is_warm(): void
    {
        $cached = collect([
            (object) [
                'id'                => 99,
                'name'              => 'cached_element',
                'label'             => 'Cached',
                'points'            => 50,
                'penalty'           => 0,
                'input_type'        => 'boolean',
                'mutually_exclusive' => false,
                'score_override'    => false,
            ],
        ]);

        Cache::put('base_elements', $cached);

        DB::enableQueryLog();

        $result = $this->repository->getBaseElements();

        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $this->assertCount(1, $result);
        $this->assertEquals('cached_element', $result->first()->name);
        $this->assertEmpty($queries, 'No DB queries should be fired when the cache is warm.');
    }
}
