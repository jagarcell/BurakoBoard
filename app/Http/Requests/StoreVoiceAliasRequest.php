<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreVoiceAliasRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * @return bool
     *
     * Logic: Always returns true; route is guarded by auth:sanctum middleware,
     *   which ensures only authenticated users reach this point.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normalise alias and keyword to lowercase before validation runs.
     *
     * @return void
     *
     * Logic: Lowercases and trims both fields so the unique DB constraint check
     *   matches correctly and repository storage stays consistent.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'alias'   => strtolower(trim((string) ($this->alias ?? ''))),
            'keyword' => strtolower(trim((string) ($this->keyword ?? ''))),
        ]);
    }

    /**
     * Get the validation rules.
     *
     * @return array<string, mixed>
     *
     * Logic: Ensures alias is unique per-user (case-insensitive via prepareForValidation
     *   normalisation) and both fields are within the DB column length limit.
     */
    public function rules(): array
    {
        return [
            'alias'   => ['required', 'string', 'max:100'],
            'keyword' => ['required', 'string', 'max:100'],
        ];
    }

    /**
     * Custom validation messages.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'alias.unique' => 'You already have an alias for that word.',
        ];
    }
}
