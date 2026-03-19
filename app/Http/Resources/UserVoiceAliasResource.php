<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserVoiceAliasResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param Request $request
     * @return array<string, mixed>
     *
     * Logic: Exposes only the id, alias, and keyword fields; omits user_id and
     *   timestamps which are internal implementation details.
     */
    public function toArray(Request $request): array
    {
        return [
            'id'      => $this->id,
            'alias'   => $this->alias,
            'keyword' => $this->keyword,
        ];
    }
}
