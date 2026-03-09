<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates game rounds with strict sequential numbering per game.
     * Logic: persist round headers per game and enforce one unique round number per game timeline.
     */
    public function up(): void
    {
        Schema::create('rounds', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
            $table->unsignedInteger('round_number');
            $table->timestamps();

            $table->unique(['game_id', 'round_number']);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the rounds table.
     * Logic: remove round timeline records used to group per-team score entries.
     */
    public function down(): void
    {
        Schema::dropIfExists('rounds');
    }
};
