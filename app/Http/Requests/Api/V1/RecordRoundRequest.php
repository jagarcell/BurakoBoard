<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class RecordRoundRequest extends FormRequest
{
    /**
     * Determine whether the user can perform this request.
     *
     * @return bool True to allow all callers for MVP round scoring.
     * Logic: keep MVP authorization open and delegate round-state business checks to the service layer.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get validation rules for round score input.
     *
     * @return array<string, mixed> Validation constraints for per-team points in a round.
     * Logic: require at least two team scores, unique team ids, and bounded point values per score entry.
     * The upper bound is set to 200 000 to accommodate large computed totals from multiple high-value
     * base elements (e.g. multiple clean comodin canastras worth 3 000 pts each).
     */
    public function rules(): array
    {
        return [
            'scores'           => ['required', 'array', 'min:2'],
            'scores.*.team_id' => ['required', 'integer', 'exists:teams,id', 'distinct'],
            'scores.*.points'  => ['required', 'integer', 'min:-200000', 'max:200000'],
        ];
    }
}
