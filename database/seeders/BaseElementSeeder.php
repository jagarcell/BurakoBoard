<?php

namespace Database\Seeders;

use App\Models\BaseElement;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class BaseElementSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the base_elements table with the standard Burako scoring elements.
     *
     * @return void
     * Logic: Uses updateOrCreate keyed on `name` so the seeder is idempotent — running it
     * multiple times will update existing rows rather than creating duplicates.
     * Elements with input_type 'boolean' represent an all-or-nothing condition (present / not present)
     * while 'quantity' elements are counted and their contribution is points × quantity.
     * A negative points value on a boolean element represents a penalty deducted from the team score.
     */
    public function run(): void
    {
        $elements = [
            [
                'name'       => 'burako',
                'label'      => 'Burako',
                'input_type' => 'boolean',
                'points'     => 100,
            ],
            [
                'name'               => 'clean_cut',
                'label'              => 'Clean Cut',
                'input_type'         => 'boolean',
                'points'             => 100,
                'mutually_exclusive' => true,
            ],
            [
                'name'               => 'round_closure',
                'label'              => 'Round Closure',
                'input_type'         => 'boolean',
                'points'             => 100,
                'mutually_exclusive' => true,
            ],
            [
                'name'       => 'clean_canastra',
                'label'      => 'Clean Canastra',
                'input_type' => 'quantity',
                'points'     => 200,
            ],
            [
                'name'       => 'dirty_canastra',
                'label'      => 'Dirty Canastra',
                'input_type' => 'quantity',
                'points'     => 100,
            ],
            [
                'name'       => 'clean_comodin_canastra',
                'label'      => 'Clean Comodin Canastra',
                'input_type' => 'boolean',
                'points'     => 3000,
            ],
            [
                'name'       => 'dirty_comodin_canastra',
                'label'      => 'Dirty Comodin Canastra',
                'input_type' => 'boolean',
                'points'     => 1000,
            ],
            [
                'name'           => 'incomplete_comodin_canastra',
                'label'          => 'Incomplete Comodin Canastra',
                'input_type'     => 'boolean',
                'points'         => 0,
                'score_override' => true,
            ],
            [
                'name'       => 'clean_a_canastra',
                'label'      => 'Clean A Canastra',
                'input_type' => 'quantity',
                'points'     => 600,
            ],
            [
                'name'       => 'dirty_a_canastra',
                'label'      => 'Dirty A Canastra',
                'input_type' => 'quantity',
                'points'     => 300,
            ],
        ];

        foreach ($elements as $element) {
            BaseElement::updateOrCreate(
                ['name' => $element['name']],
                [
                    'label'              => $element['label'],
                    'input_type'         => $element['input_type'],
                    'points'             => $element['points'],
                    'mutually_exclusive' => $element['mutually_exclusive'] ?? false,
                    'score_override'     => $element['score_override'] ?? false,
                ]
            );
        }
    }
}
