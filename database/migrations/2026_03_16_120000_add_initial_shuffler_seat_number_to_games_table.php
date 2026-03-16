<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Adds an optional initial shuffler seat reference to games.
     * Logic: persist the starting seat for shuffling so per-round shuffler/dealer/first-draw
     * rotation can be derived deterministically from seat order.
     */
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table): void {
            $table->unsignedInteger('initial_shuffler_seat_number')
                ->nullable()
                ->after('current_round_number');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Removes the initial shuffler seat reference from games.
     * Logic: drop the additive column so schema can roll back to the previous game model.
     */
    public function down(): void
    {
        Schema::table('games', function (Blueprint $table): void {
            $table->dropColumn('initial_shuffler_seat_number');
        });
    }
};
