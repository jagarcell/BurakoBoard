<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class AddTeamPlayerRequest extends FormRequest
{
    /**
     * Normalise the player name before validation runs.
     *
     * @return void
     * Logic: trim leading/trailing whitespace and collapse any run of internal spaces to a
     * single space so that 'Carlos  Garcia' and 'Carlos Garcia' are treated as the same value.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('name') && $this->input('name') !== null) {
            $this->merge([
                'name' => preg_replace('/\s+/', ' ', trim($this->input('name', ''))),
            ]);
        }
    }

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
