<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Logic: Adds a nullable, unique `apple_id` column after `google_id` to
     *        store the stable identifier returned by Apple Sign In, enabling
     *        look-up of existing accounts on subsequent logins without
     *        requiring the user's e-mail.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('apple_id')->nullable()->unique()->after('google_id');
        });
    }

    /**
     * Reverse the migrations.
     *
     * Logic: Drops the `apple_id` column unconditionally.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('apple_id');
        });
    }
};
