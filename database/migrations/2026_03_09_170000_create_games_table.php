<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates the games table to track game lifecycle and target score.
     * Logic: store configurable winning threshold, current game status, optional winner, and latest completed round number.
     */
    public function up(): void
    {
        Schema::create('games', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->unsignedInteger('target_points');
            $table->string('status')->default('in_progress');
            $table->unsignedBigInteger('winning_team_id')->nullable();
            $table->unsignedInteger('current_round_number')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the games table.
     * Logic: remove the game root table so dependent MVP game data can be recreated from scratch.
     */
    public function down(): void
    {
        Schema::dropIfExists('games');
    }
};
