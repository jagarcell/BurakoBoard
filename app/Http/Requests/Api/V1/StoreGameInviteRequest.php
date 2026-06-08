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
            'user_ids'   => ['sometimes', 'array'],
            'user_ids.*' => ['required_with:user_ids', 'integer', 'exists:users,id'],

            'emails'     => ['sometimes', 'array'],
            'emails.*'   => ['required_with:emails', 'email', 'distinct'],
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
            'emails'     => 'email list',
            'emails.*'   => 'email',
        ];
    }

    /**
     * Add an after-validation hook to require at least one of `user_ids` or `emails`.
     *
     * @param \Illuminate\Contracts\Validation\Validator $validator The validator instance to attach the hook to.
     * @return void
     * Logic: after the base rules run, ensure the payload contains at least one
     *  invitation target (either a non-empty `user_ids` array or a non-empty
     *  `emails` array). If neither is present, add a validation error under the
     *  `invitations` key so callers receive a single, clear message.
     */
    protected function withValidator(\Illuminate\Contracts\Validation\Validator $validator)
    {
        $validator->after(function ($validator) {
            $data = $this->validated() ?: $this->all();

            $hasUserIds = isset($data['user_ids']) && is_array($data['user_ids']) && count($data['user_ids']) > 0;
            $hasEmails  = isset($data['emails']) && is_array($data['emails']) && count($data['emails']) > 0;

            if (! $hasUserIds && ! $hasEmails) {
                $validator->errors()->add('invitations', 'You must provide at least one user or email to invite.');
            }
        });
    }
}
