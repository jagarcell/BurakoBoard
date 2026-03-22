<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Game Invitation — BurakoBoard</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        .wrapper {
            max-width: 560px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 24px rgba(15, 23, 42, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #f8fafc 0%, #ffffff 56%, #eef2ff 100%);
            padding: 32px 40px 24px;
            border-bottom: 1px solid #e2e8f0;
        }
        .logo {
            font-size: 20px;
            font-weight: 700;
            color: #1e293b;
            letter-spacing: -0.3px;
        }
        .logo span {
            color: #6366f1;
        }
        .body {
            padding: 32px 40px;
        }
        .greeting {
            font-size: 22px;
            font-weight: 600;
            color: #0f172a;
            margin: 0 0 12px;
        }
        .intro {
            font-size: 15px;
            color: #475569;
            line-height: 1.6;
            margin: 0 0 28px;
        }
        .game-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 28px;
        }
        .game-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #94a3b8;
            margin: 0 0 6px;
        }
        .game-name {
            font-size: 18px;
            font-weight: 700;
            color: #1e293b;
            margin: 0 0 4px;
        }
        .game-meta {
            font-size: 13px;
            color: #64748b;
            margin: 0;
        }
        .cta-wrapper {
            text-align: center;
            margin-bottom: 28px;
        }
        .cta-button {
            display: inline-block;
            background-color: #6366f1;
            color: #ffffff !important;
            text-decoration: none;
            font-size: 15px;
            font-weight: 600;
            padding: 14px 32px;
            border-radius: 10px;
            letter-spacing: 0.01em;
        }
        .note {
            font-size: 13px;
            color: #94a3b8;
            line-height: 1.5;
            margin: 0;
        }
        .footer {
            padding: 20px 40px;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            text-align: center;
        }
        .footer p {
            font-size: 12px;
            color: #94a3b8;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="header">
            <div class="logo">Burako<span>Board</span></div>
        </div>

        <div class="body">
            <h1 class="greeting">Hi {{ $invitee->name }},</h1>

            <p class="intro">
                <strong>{{ $inviter->name }}</strong> has invited you to watch a Burako game
                on BurakoBoard. As a viewer you can follow the scores and history in real time.
            </p>

            <div class="game-card">
                <p class="game-label">You've been invited to</p>
                <p class="game-name">{{ $game->name }}</p>
                <p class="game-meta">Target score: {{ number_format($game->target_points) }} pts</p>
            </div>

            <div class="cta-wrapper">
                <a class="cta-button" href="{{ config('app.url') }}/login?email={{ rawurlencode($invitee->email) }}&game={{ $game->id }}">
                    Open BurakoBoard
                </a>
            </div>

            <p class="note">
                After you log in, the game will be pre-selected in the dropdown.
                Click <strong>Accept Invite</strong> to confirm your role as a viewer.
            </p>
        </div>

        <div class="footer">
            <p>
                © {{ date('Y') }} BurakoBoard &mdash; You received this email because
                {{ $inviter->name }} invited you to a game.
            </p>
        </div>
    </div>
</body>
</html>
