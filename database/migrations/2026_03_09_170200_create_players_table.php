<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates players that may optionally map to app users.
     * Logic: support both guest participants and registered-user participants through nullable user linkage.
     */
    public function up(): void
    {
        Schema::create('players', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('display_name');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the players table.
     * Logic: remove player identities used by team membership assignments in the MVP domain.
     */
    public function down(): void
    {
        Schema::dropIfExists('players');
    }
};
