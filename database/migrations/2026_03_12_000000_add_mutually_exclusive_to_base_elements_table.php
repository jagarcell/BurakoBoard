<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add the mutually_exclusive flag to the base_elements table.
     *
     * @return void
     * Logic: when mutually_exclusive is true on a boolean element, only one team may have that
     * element checked at a time; checking it for one team automatically clears it for all others.
     * Defaults to false so all existing elements are unaffected.
     */
    public function up(): void
    {
        Schema::table('base_elements', function (Blueprint $table): void {
            $table->boolean('mutually_exclusive')->default(false)->after('input_type');
        });
    }

    /**
     * Remove the mutually_exclusive flag from the base_elements table.
     *
     * @return void
     * Logic: drops the column when rolling back this migration.
     */
    public function down(): void
    {
        Schema::table('base_elements', function (Blueprint $table): void {
            $table->dropColumn('mutually_exclusive');
        });
    }
};
