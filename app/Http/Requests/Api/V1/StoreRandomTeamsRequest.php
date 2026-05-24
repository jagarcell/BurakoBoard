<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreRandomTeamsRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True; creator authorization is enforced by the service layer.
     * Logic: keep HTTP request authorization lightweight and centralize game-role business rules in TeamService.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for creating random two-team splits.
     *
     * @return array<string, mixed> Validation constraints for the player-name list.
     * Logic: require an array with at most six candidate names; each provided name must be a bounded string.
     *   The exact 4-or-6 player-count business rule is enforced in TeamService after normalization.
     */
    public function rules(): array
    {
        return [
            'players' => ['required', 'array', 'max:6'],
            'players.*' => ['nullable', 'string', 'max:120'],
        ];
    }
}