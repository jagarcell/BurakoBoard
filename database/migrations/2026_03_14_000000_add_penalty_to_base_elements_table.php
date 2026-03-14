<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add the penalty column to the base_elements table.
     *
     * @return void
     * Logic: penalty holds the number of points to subtract from the team's base score when the element
     * is not checked (boolean) or has no quantity (quantity). A value of 0 means no penalty applies,
     * keeping all existing elements unaffected. The column is placed immediately after `points` to keep
     * related scoring fields together in the schema.
     */
    public function up(): void
    {
        Schema::table('base_elements', function (Blueprint $table): void {
            $table->integer('penalty')->default(0)->after('points');
        });
    }

    /**
     * Remove the penalty column from the base_elements table.
     *
     * @return void
     * Logic: drops the column when rolling back this migration.
     */
    public function down(): void
    {
        Schema::table('base_elements', function (Blueprint $table): void {
            $table->dropColumn('penalty');
        });
    }
};
