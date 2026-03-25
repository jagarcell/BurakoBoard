<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreGameRematchRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True for all authenticated callers; the service layer enforces creator-only access.
     * Logic: authorization is delegated to the service tier so the request class stays focused on validation.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for creating a rematch game.
     *
     * @return array<string, mixed> Validation constraints for rematch game payload.
     * Logic: enforce required name and positive target score boundaries identical to a standard game creation request.
     */
    public function rules(): array
    {
        return [
            'name'          => ['required', 'string', 'max:120'],
            'target_points' => ['required', 'integer', 'min:1', 'max:50000'],
        ];
    }
}
