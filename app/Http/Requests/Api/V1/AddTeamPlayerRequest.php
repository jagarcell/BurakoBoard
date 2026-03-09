<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class AddTeamPlayerRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True to allow all callers for MVP player assignment.
     * Logic: leave authorization permissive for MVP and rely on validation plus service rules for correctness.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for assigning a player to a team.
     *
     * @return array<string, mixed> Validation constraints requiring either a name or user id.
     * Logic: enforce mutually sufficient identity input so each player is resolvable as guest name or registered user.
     */
    public function rules(): array
    {
        return [
            'name' => ['nullable', 'string', 'max:120', 'required_without:user_id'],
            'user_id' => ['nullable', 'integer', 'exists:users,id', 'required_without:name'],
        ];
    }
}
