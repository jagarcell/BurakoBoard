<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class UpsertRoundDraftRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * @return bool Always true; authorization is enforced at the route level.
     * Logic: draft saving is a public game operation attached to an in-progress
     * game, so no user-specific authorization check is required here.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Validation rules for creating or updating a round draft.
     *
     * @return array<string, mixed> Validation rules for the draft payload.
     * Logic: accept nullable JSON blobs for both input maps; deeper key validation
     * is not required because the values are treated as opaque UI state by the backend.
     */
    public function rules(): array
    {
        return [
            'base_inputs' => ['nullable', 'array'],
            'card_inputs' => ['nullable', 'array'],
        ];
    }
}
