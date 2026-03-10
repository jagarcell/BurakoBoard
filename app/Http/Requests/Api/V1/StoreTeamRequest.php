<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\DB;

class StoreTeamRequest extends FormRequest
{
    /**
     * Normalise the team name before validation runs.
     *
     * @return void
     * Logic: trim leading/trailing whitespace and collapse any run of internal spaces to a
     * single space so that "Team  Alpha" and "Team Alpha" are treated as the same value
     * by the unique constraint and the max:120 length check.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('name')) {
            $this->merge([
                'name' => preg_replace('/\s+/', ' ', trim($this->input('name', ''))),
            ]);
        }
    }

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
     * Get validation rules for creating or updating a team.
     *
     * @return array<string, mixed> Validation constraints for team payload.
     * Logic: require a bounded team name that is unique within the game using a case-insensitive
     * LOWER() comparison so 'Team Alpha' and 'TEAM ALPHA' are treated as the same name;
     * for updates the current team row is excluded so renaming to the same name (any casing) is allowed;
     * the original casing supplied by the caller is preserved for storage.
     */
    public function rules(): array
    {
        $gameId = $this->route('gameId');
        $teamId = $this->route('teamId');

        return [
            'name' => [
                'required',
                'string',
                'max:120',
                function (string $attribute, mixed $value, \Closure $fail) use ($gameId, $teamId): void {
                    $exists = DB::table('teams')
                        ->where('game_id', $gameId)
                        ->whereRaw('LOWER(name) = ?', [strtolower($value)])
                        ->when($teamId, fn ($q) => $q->where('id', '!=', $teamId))
                        ->exists();

                    if ($exists) {
                        $fail('A team with this name already exists in this game.');
                    }
                },
            ],
        ];
    }
}
