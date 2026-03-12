<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add the score_override flag to the base_elements table.
     *
     * @return void
     * Logic: when score_override is true on a boolean element and it is checked for a team, the normal
     * scoring formula is completely bypassed and the team's round score becomes -(cardsInHand + cardsOnTable).
     * This makes penalty-mode behaviour configurable per element without hardcoding element names in the UI or
     * service layer. Defaults to false so all existing elements are unaffected.
     */
    public function up(): void
    {
        Schema::table('base_elements', function (Blueprint $table): void {
            $table->boolean('score_override')->default(false)->after('mutually_exclusive');
        });
    }

    /**
     * Remove the score_override flag from the base_elements table.
     *
     * @return void
     * Logic: drops the column when rolling back this migration.
     */
    public function down(): void
    {
        Schema::table('base_elements', function (Blueprint $table): void {
            $table->dropColumn('score_override');
        });
    }
};
