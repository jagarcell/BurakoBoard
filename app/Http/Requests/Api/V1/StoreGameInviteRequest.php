<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreGameInviteRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * @return bool True when the request carries a valid Sanctum session.
     * Logic: the route is already guarded by auth:sanctum so every caller is authenticated;
     *   this method simply confirms authorization at the form-request level.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, list<mixed>> Validation rules for the invitation payload.
     * Logic: require a non-empty array of integer user IDs; each ID must reference an
     *   existing record in the users table to prevent phantom invitations.
     */
    public function rules(): array
    {
        return [
            'user_ids'   => ['required', 'array', 'min:1'],
            'user_ids.*' => ['required', 'integer', 'exists:users,id'],
        ];
    }

    /**
     * Return human-readable attribute names for validation error messages.
     *
     * @return array<string, string> Friendly attribute names keyed by rule path.
     * Logic: override the default dotted-path names so error messages read naturally in API responses.
     */
    public function attributes(): array
    {
        return [
            'user_ids'   => 'user list',
            'user_ids.*' => 'user',
        ];
    }
}
