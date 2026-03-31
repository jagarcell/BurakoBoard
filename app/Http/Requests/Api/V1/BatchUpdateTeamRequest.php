<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class BatchUpdateTeamRequest extends FormRequest
{
    /**
     * Normalise the team name before validation runs.
     *
     * @return void
     * Logic: trim and collapse internal whitespace so 'Team  Alpha' and 'Team Alpha'
     * are treated as equivalent by the validation rules and service layer.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('name')) {
            $this->merge([
                'name' => preg_replace('/\s+/', ' ', trim($this->input('name', ''))),
            ]);
        }
    }

    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True to allow all authenticated callers.
     * Logic: authentication is enforced by the auth:sanctum middleware on the route.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for the batch team-update operation.
     *
     * @return array<string, mixed> Validation constraints for all four change vectors.
     * Logic:
     *   - name: required string, max 120 characters.
     *   - remove_player_ids: optional array of distinct positive integers.
     *   - add_players: optional array of player descriptors, each requiring either a name
     *     or a registered user_id (mirroring AddTeamPlayerRequest).
     *   - seat_swaps: optional array of seat-swap pairs, each with two distinct positive integers
     *     (mirroring SwapPlayerSeatsRequest).
     */
    public function rules(): array
    {
        return [
            'name'                       => ['required', 'string', 'max:120'],
            'remove_player_ids'          => ['sometimes', 'array'],
            'remove_player_ids.*'        => ['integer', 'min:1', 'distinct'],
            'add_players'                => ['sometimes', 'array'],
            'add_players.*.name'         => ['nullable', 'string', 'max:120', 'required_without:add_players.*.user_id'],
            'add_players.*.user_id'      => ['nullable', 'integer', 'exists:users,id', 'required_without:add_players.*.name'],
            'seat_swaps'                 => ['sometimes', 'array'],
            'seat_swaps.*.player_id_a'   => ['required', 'integer', 'min:1'],
            'seat_swaps.*.player_id_b'   => ['required', 'integer', 'min:1', 'different:seat_swaps.*.player_id_a'],
        ];
    }
}
