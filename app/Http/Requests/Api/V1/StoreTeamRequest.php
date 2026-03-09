<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreTeamRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True to allow all callers for MVP team creation.
     * Logic: allow all callers in MVP while centralizing team payload validation in this request object.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for creating a team.
     *
     * @return array<string, mixed> Validation constraints for team payload.
     * Logic: require one bounded team name so duplicate/empty data is rejected before service execution.
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
        ];
    }
}
