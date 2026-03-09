<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates the team-player assignment table.
     * Logic: represent many-to-many team membership and prevent duplicate player assignments to the same team.
     */
    public function up(): void
    {
        Schema::create('team_player', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('team_id')->constrained('teams')->cascadeOnDelete();
            $table->foreignId('player_id')->constrained('players')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['team_id', 'player_id']);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the team_player table.
     * Logic: clear membership pivot records when rolling back MVP team-player relationships.
     */
    public function down(): void
    {
        Schema::dropIfExists('team_player');
    }
};
