<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates the base_elements table.
     * Logic: each row defines one named scoring element used to compute the base (e.g. "clean canasta") together
     * with the integer point value it contributes; the name column is unique so element keys cannot be duplicated.
     * The input_type column describes how the element value is captured in the UI and consumed by the API:
     *   - 'boolean'  → the element either exists or not for a given round (rendered as a checkbox).
     *   - 'quantity' → the element can appear multiple times (rendered as a numeric input); the total
     *                  contribution is points × quantity entered.
     */
    public function up(): void
    {
        Schema::create('base_elements', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->string('label');
            $table->integer('points');
            $table->enum('input_type', ['boolean', 'quantity'])->default('boolean');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the base_elements table.
     * Logic: removes all base element configuration rows when rolling back this schema change.
     */
    public function down(): void
    {
        Schema::dropIfExists('base_elements');
    }
};
