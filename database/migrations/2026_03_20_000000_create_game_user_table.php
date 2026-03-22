<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates the game_user pivot table linking users to games with a role.
     * Logic:
     *   Creates a composite-primary pivot table (game_id, user_id) with an enum `role` column
     *   representing the user's relationship to the game: creator, pending_invitee, or viewer.
     *   Both FK columns are indexed; cascading deletes keep the pivot clean when either parent
     *   record is removed.
     */
    public function up(): void
    {
        Schema::create('game_user', function (Blueprint $table): void {
            $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('role', ['creator', 'pending_invitee', 'viewer']);
            $table->primary(['game_id', 'user_id']);
            $table->index('user_id');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the game_user pivot table.
     * Logic: Drops the entire table; foreign key constraints are automatically removed with it.
     */
    public function down(): void
    {
        Schema::dropIfExists('game_user');
    }
};
