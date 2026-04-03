<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     * Logic: Creates the card_weights table that stores the authoritative point value for each
     * playing-card rank used in Burako. The rank column is unique so each rank appears exactly
     * once. sort_order drives consistent display ordering in the UI without relying on
     * alphabetic rank names. Both rank and sort_order are indexed because they are used in
     * WHERE and ORDER BY clauses respectively.
     */
    public function up(): void
    {
        Schema::create('card_weights', function (Blueprint $table) {
            $table->id();
            $table->string('rank', 6)->unique();
            $table->string('label', 32);
            $table->smallInteger('points')->unsigned();
            $table->tinyInteger('sort_order')->unsigned()->default(0);
            $table->timestamps();

            $table->index('sort_order');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     * Logic: Drop the card_weights table entirely, removing all stored rank-to-point mappings.
     */
    public function down(): void
    {
        Schema::dropIfExists('card_weights');
    }
};
