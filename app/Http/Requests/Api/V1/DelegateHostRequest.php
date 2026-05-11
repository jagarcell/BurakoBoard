<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class DelegateHostRequest extends FormRequest
{
    /**
     * Determine whether the user is authorized to perform this request.
     *
     * @return bool True; authorization is enforced at the service layer (creator-only guard).
     * Logic: return true and delegate the creator check to GameService::delegateHost so
     *   the HTTP layer stays thin and the 403 response is generated consistently.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for the host-delegation request.
     *
     * @return array<string, mixed> Validation constraints for the target user.
     * Logic: require a concrete user identifier that references an existing users row.
     *   Additional domain validation (viewer membership) is performed in the service layer.
     */
    public function rules(): array
    {
        return [
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ];
    }
}
