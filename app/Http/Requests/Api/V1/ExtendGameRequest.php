<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class ExtendGameRequest extends FormRequest
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
     * Get validation rules for extending a finished game with a new points goal.
     *
     * @return array<string, mixed> Validation constraints for the extend-game payload.
     * Logic: enforce a required positive target_points value within the same bounds used when creating a game.
     */
    public function rules(): array
    {
        return [
            'target_points' => ['required', 'integer', 'min:1', 'max:50000'],
        ];
    }
}
