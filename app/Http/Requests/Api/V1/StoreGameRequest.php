<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreGameRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True to allow all callers for MVP game creation.
     * Logic: keep authorization open at MVP stage; access control can be added without changing validation contract.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for creating a game.
     *
     * @return array<string, mixed> Validation constraints for game payload.
     * Logic: enforce required name and positive target score boundaries to prevent invalid game setup.
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'target_points' => ['required', 'integer', 'min:1', 'max:50000'],
        ];
    }
}
