<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class AmendRoundRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True to allow authenticated callers; role-based guards are handled elsewhere.
     * Logic: keep request authorization lightweight and delegate game/round business checks to the service layer.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for amending a closed round.
     *
     * @return array<string, mixed> Validation rules for amended scores and optional archived detail payload.
     * Logic: require a full per-team score list (same contract as round recording) and accept nullable
     * base/card input maps so the archived round_drafts snapshot can be updated with amended values.
     */
    public function rules(): array
    {
        return [
            'scores'           => ['required', 'array', 'min:2'],
            'scores.*.team_id' => ['required', 'integer', 'exists:teams,id', 'distinct'],
            'scores.*.points'  => ['required', 'integer', 'min:-200000', 'max:200000'],
            'base_inputs'      => ['nullable', 'array'],
            'card_inputs'      => ['nullable', 'array'],
        ];
    }
}
