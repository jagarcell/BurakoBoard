<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('user_voice_aliases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('alias', 100);
            $table->string('keyword', 100);
            $table->timestamps();

            // Prevent the same misheard word appearing twice for the same user.
            $table->unique(['user_id', 'alias']);
            // Foreign key column is always indexed; unique above already covers user_id.
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_voice_aliases');
    }
};
