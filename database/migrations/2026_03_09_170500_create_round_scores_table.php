<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates per-team scores for each round.
     * Logic: store one points value per team per round and enforce uniqueness of that pair.
     */
    public function up(): void
    {
        Schema::create('round_scores', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('round_id')->constrained('rounds')->cascadeOnDelete();
            $table->foreignId('team_id')->constrained('teams')->cascadeOnDelete();
            $table->integer('points');
            $table->timestamps();

            $table->unique(['round_id', 'team_id']);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the round_scores table.
     * Logic: delete historical per-round score entries when rolling back scoring schema.
     */
    public function down(): void
    {
        Schema::dropIfExists('round_scores');
    }
};
