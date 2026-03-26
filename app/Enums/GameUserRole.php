<?php

namespace App\Enums;

enum GameUserRole: string
{
    case Creator        = 'creator';
    case PendingInvitee = 'pending_invitee';
    case Viewer         = 'viewer';
}
