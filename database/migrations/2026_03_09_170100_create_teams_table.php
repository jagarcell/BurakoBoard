<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates the teams table with running score tracking per game.
     * Logic: bind each team to a game, keep cumulative score, and enforce unique team names within the same game.
     */
    public function up(): void
    {
        Schema::create('teams', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
            $table->string('name');
            $table->integer('current_score')->default(0);
            $table->timestamps();

            $table->unique(['game_id', 'name']);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the teams table.
     * Logic: drop team rows and related foreign-key data before rebuilding schema changes.
     */
    public function down(): void
    {
        Schema::dropIfExists('teams');
    }
};
