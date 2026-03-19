<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class SwapPlayerSeatsRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True to allow all callers for MVP seat swapping.
     * Logic: leave authorization permissive for MVP and rely on validation plus service rules.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for swapping the seats of two players in a game.
     *
     * @return array<string, mixed> Validation constraints requiring two distinct positive player IDs.
     * Logic: enforce that two different player identifiers are provided so the service can swap their
     * seat numbers without operating on the same record twice.
     */
    public function rules(): array
    {
        return [
            'player_id_a' => ['required', 'integer', 'min:1'],
            'player_id_b' => ['required', 'integer', 'min:1', 'different:player_id_a'],
        ];
    }
}
