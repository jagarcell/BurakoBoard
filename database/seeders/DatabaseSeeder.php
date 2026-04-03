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
        // User::factory(10)->create();

        try {
            User::factory()->create([
                'name' => 'Test User',
                'email' => 'test@example.com',
            ]);
        } catch (\Exception $e) {
            // Ignore if the user already exists
        }

        $this->call([
            BaseElementSeeder::class,
            CardWeightSeeder::class,
        ]);
    }
}
