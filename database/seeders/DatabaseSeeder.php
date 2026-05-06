<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     *
     * @return void
     * Logic: Calls individual seeders in dependency order. BaseElementSeeder populates the
     * static scoring-element lookup table that other seeders and tests may rely on.
     */
    public function run(): void
    {
        $this->call([
            BaseElementSeeder::class,
            CardWeightSeeder::class,
        ]);
    }
}
