<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class SetInitialShufflerRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True to allow all callers for MVP shuffler configuration.
     * Logic: keep authorization permissive for MVP and rely on validation plus service rules for correctness.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for selecting the initial shuffler.
     *
     * @return array<string, mixed> Validation constraints for player selection.
     * Logic: require one concrete player identifier and ensure it references an existing players row.
     */
    public function rules(): array
    {
        return [
            'player_id' => ['required', 'integer', 'exists:players,id'],
        ];
    }
}
