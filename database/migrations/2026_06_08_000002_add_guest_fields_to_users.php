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
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_guest')->default(false)->after('remember_token');
            $table->unsignedBigInteger('invited_by_id')->nullable()->after('is_guest');
            $table->timestamp('invited_at')->nullable()->after('invited_by_id');
            $table->index('invited_by_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['invited_by_id']);
            $table->dropColumn(['is_guest', 'invited_by_id', 'invited_at']);
        });
    }
};
