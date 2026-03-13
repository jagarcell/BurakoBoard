<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates the round_drafts table.
     * Logic: store one in-progress round draft per game so the user's unsaved scoring inputs
     * survive a page refresh. The table enforces a unique constraint on game_id so upserts
     * always result in a single row per game rather than accumulating stale drafts.
     */
    public function up(): void
    {
        Schema::create('round_drafts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
            $table->json('base_inputs')->nullable()->comment('Per-team base element values keyed by team ID then element ID.');
            $table->json('card_inputs')->nullable()->comment('Per-team card counts (cardsInHand, cardsOnTable) keyed by team ID.');
            $table->timestamps();

            $table->unique('game_id');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the round_drafts table.
     * Logic: remove the draft persistence layer entirely on rollback.
     */
    public function down(): void
    {
        Schema::dropIfExists('round_drafts');
    }
};
