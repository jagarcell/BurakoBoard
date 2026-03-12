<?php

namespace Tests\Feature\Api;

use App\Models\BaseElement;
use Database\Seeders\BaseElementSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BaseElementIndexTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Ensure the base elements index returns an empty list when no elements exist.
     *
     * @return void Verifies the endpoint returns an empty array for a fresh database.
     * Logic: call the endpoint with no base elements seeded and assert the data array is empty.
     */
    public function test_base_elements_index_returns_empty_list_when_none_exist(): void
    {
        $response = $this->getJson('/api/v1/base-elements');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(0, 'data.base_elements');
    }

    /**
     * Ensure the base elements index returns all elements with the correct fields.
     *
     * @return void Verifies the endpoint exposes id, name, label, points, and input_type.
     * Logic: create a boolean and a quantity element, call the endpoint, and assert both rows
     * are present with correctly serialized fields.
     */
    public function test_base_elements_index_returns_all_elements_with_correct_fields(): void
    {
        BaseElement::create([
            'name'       => 'burako',
            'label'      => 'Burako',
            'points'     => 100,
            'input_type' => 'boolean',
        ]);

        BaseElement::create([
            'name'       => 'clean_canastra',
            'label'      => 'Clean Canastra',
            'points'     => 200,
            'input_type' => 'quantity',
        ]);

        $response = $this->getJson('/api/v1/base-elements');

        $response
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(2, 'data.base_elements')
            ->assertJsonPath('data.base_elements.0.name', 'burako')
            ->assertJsonPath('data.base_elements.0.label', 'Burako')
            ->assertJsonPath('data.base_elements.0.points', 100)
            ->assertJsonPath('data.base_elements.0.input_type', 'boolean')
            ->assertJsonPath('data.base_elements.1.name', 'clean_canastra')
            ->assertJsonPath('data.base_elements.1.points', 200)
            ->assertJsonPath('data.base_elements.1.input_type', 'quantity');
    }

    /**
     * Ensure the base elements index returns elements ordered by id ascending.
     *
     * @return void Verifies elements are returned in insertion/id order.
     * Logic: create three elements and assert they appear in id order so the round scoring
     * form renders a stable, predictable list.
     */
    public function test_base_elements_index_returns_elements_ordered_by_id(): void
    {
        $this->seed(BaseElementSeeder::class);

        $response = $this->getJson('/api/v1/base-elements');

        $response->assertOk();

        $ids = collect($response->json('data.base_elements'))->pluck('id');

        $this->assertEquals($ids->values()->all(), $ids->sort()->values()->all());
    }

    /**
     * Ensure the base elements response does not expose sensitive or extraneous fields.
     *
     * @return void Verifies only the expected fields are present in each element.
     * Logic: seed one element and assert the payload contains exactly id, name, label, points,
     * and input_type — no timestamps or other ORM artifacts.
     */
    public function test_base_elements_response_exposes_only_expected_fields(): void
    {
        BaseElement::create([
            'name'       => 'round_closure',
            'label'      => 'Round Closure',
            'points'     => 100,
            'input_type' => 'boolean',
        ]);

        $response = $this->getJson('/api/v1/base-elements');

        $element = $response->json('data.base_elements.0');

        $this->assertArrayHasKey('id', $element);
        $this->assertArrayHasKey('name', $element);
        $this->assertArrayHasKey('label', $element);
        $this->assertArrayHasKey('points', $element);
        $this->assertArrayHasKey('input_type', $element);
        $this->assertArrayNotHasKey('created_at', $element);
        $this->assertArrayNotHasKey('updated_at', $element);
    }
}
