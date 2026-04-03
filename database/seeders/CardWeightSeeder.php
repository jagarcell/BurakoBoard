<?php

namespace Database\Seeders;

use App\Models\CardWeight;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Cache;

class CardWeightSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the card_weights table with the standard Burako card point values.
     *
     * @return void
     * Logic: Uses updateOrCreate keyed on `rank` so the seeder is idempotent — running it
     * multiple times will update existing rows rather than creating duplicates. After all
     * upserts the 'card_weights' cache key is flushed so the next API request re-fetches
     * the updated catalogue from the database. sort_order reflects descending point value,
     * matching the canonical Burako/Canasta card hierarchy.
     */
    public function run(): void
    {
        $weights = [
            ['rank' => 'joker', 'label' => 'Joker',       'points' => 50, 'sort_order' => 1],
            ['rank' => '2',     'label' => 'Two (Wild)',   'points' => 25, 'sort_order' => 2],
            ['rank' => 'A',     'label' => 'Ace',          'points' => 20, 'sort_order' => 3],
            ['rank' => 'K',     'label' => 'King',         'points' => 10, 'sort_order' => 4],
            ['rank' => 'Q',     'label' => 'Queen',        'points' => 10, 'sort_order' => 5],
            ['rank' => 'J',     'label' => 'Jack',         'points' => 10, 'sort_order' => 6],
            ['rank' => '10',    'label' => 'Ten',          'points' => 10, 'sort_order' => 7],
            ['rank' => '9',     'label' => 'Nine',         'points' => 10, 'sort_order' => 8],
            ['rank' => '8',     'label' => 'Eight',        'points' => 10, 'sort_order' => 9],
            ['rank' => '7',     'label' => 'Seven',        'points' =>  5, 'sort_order' => 10],
            ['rank' => '6',     'label' => 'Six',          'points' =>  5, 'sort_order' => 11],
            ['rank' => '5',     'label' => 'Five',         'points' =>  5, 'sort_order' => 12],
            ['rank' => '4',     'label' => 'Four',         'points' =>  5, 'sort_order' => 13],
            ['rank' => '3',     'label' => 'Three',        'points' =>  5, 'sort_order' => 14],
        ];

        foreach ($weights as $weight) {
            CardWeight::updateOrCreate(
                ['rank' => $weight['rank']],
                $weight,
            );
        }

        Cache::forget('card_weights');
    }
}
