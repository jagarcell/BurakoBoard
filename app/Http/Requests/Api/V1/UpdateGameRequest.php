<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class UpdateGameRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True to allow all callers for MVP game editing.
     * Logic: keep authorization open at MVP stage; access control can be added without changing the validation contract.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for updating a game.
     *
     * @return array<string, mixed> Validation constraints for the update game payload.
     * Logic: enforce required name and positive target score boundaries identical to creation to ensure consistent game state.
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'target_points' => ['required', 'integer', 'min:1', 'max:50000'],
        ];
    }
}
