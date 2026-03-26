<?php

namespace App\Enums;

enum GameStatus: string
{
    case InProgress = 'in_progress';
    case Finished   = 'finished';
}
