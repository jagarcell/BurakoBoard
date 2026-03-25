# BurakoBoard

BurakoBoard is a real-time digital scorekeeper and game manager for the card game **Buraco**, designed for two teams of two players. It replaces pen-and-paper scoring with a live, collaborative web interface where all participants see scores update instantly as each round is entered.

---

## App Summary

BurakoBoard digitises the full lifecycle of a Buraco card-game session: from creating a game, forming teams, assigning and seating players, through to round-by-round draft scoring and automated winner detection. Multiple users can watch and interact with the same game in real time, and the platform supports email/social login, game invitations, and voice-command aliases for hands-free score entry.

---

## App Capabilities & Workflow

### Game Lifecycle
1. **Create a game** — An authenticated user names the game and sets a target-points threshold. The creator is automatically enrolled as the game owner.
2. **Invite players** — The owner searches for registered users and sends email invitations; recipients accept or ignore invitations from their notification bell.
3. **Build teams** — Up to two teams are added to the game. Each team is given a name and players are assigned to it via seat positions.
4. **Set the initial shuffler** — Before the first round starts, a player is designated as the initial shuffler, establishing turn order.

### Round Scoring
5. **Draft entry** — An authenticated user owning the game opens the round-draft panel and fills in per-team scores using a structured form. The draft is persisted in real time and broadcast to all connected clients via WebSockets, so every viewer sees edits as they happen.
6. **Commit a round** — When the draft is confirmed, the round is finalised, per-team scores are accumulated, and the running totals are updated.
7. **Win detection** — When a team's cumulative score reaches or exceeds the target, the game is closed and the winning team is recorded.
8. **Rematch** — The owner can start a rematch, cloning the team/player setup into a fresh game.

### Base Elements & Scoring Rules
The scoring form is driven by a configurable **base-elements** catalogue (seeded from `BaseElementSeeder`). Each element carries a label, point value, penalty, input type (checkbox, number, etc.), and two behaviour flags:
- `mutually_exclusive` — selecting this element deselects conflicting ones automatically.
- `score_override` — this element's value replaces rather than adds to the accumulated sub-total.

### Real-Time Collaboration
All game-state mutations broadcast Laravel events over **Laravel Reverb** (WebSocket server) and **Pusher JS** on the client. The frontend subscribes to game and round-draft channels so scoreboards, team lists, and drafts stay in sync without polling.

### Voice Aliases
Each user can register custom voice aliases — a display alias paired with a keyword — to enable voice-command-driven score entry directly from the game board.

### Authentication
- Email/password registration and login via **Laravel Breeze**.
- Social login via **Apple OAuth** (`socialiteproviders/apple`).
- API authentication via **Laravel Sanctum** (token-based for API routes).

---

## Backend Stack

| Technology                     | Version |
|--------------------------------|---------|
| PHP                            |  8.2.30 |
| Laravel Framework              | 12.53.0 |
| MySQL                          |  8.0.32 |
| Laravel Reverb (WebSockets)    |    ^1.8 |
| Laravel Sanctum (API auth)     |    ^4.0 |
| Laravel Socialite              |   ^5.25 |
| Inertia.js (Laravel adapter)   |    ^2.0 |
| Tightenco Ziggy (named routes) |    ^2.0 |
| Pusher PHP Server              |    ^7.2 |
| Socialite Providers – Apple    |    ^5.9 |

### Dev / Testing
| Package                        | Version |
|--------------------------------|---------|
| PHPUnit                        | ^11.5.3 |
| Laravel Pint (code style)      |   ^1.24 |
| Mockery                        |    ^1.6 |
| Faker                          |   ^1.23 |
| Nunomaduro Collision           |    ^8.6 |

---

## Frontend Stack

| Technology                     | Version |
|--------------------------------|---------|
| React                          | ^18.2.0 |
| Inertia.js (React adapter)     |  ^2.0.0 |
| Vite                           |  ^7.0.7 |
| Tailwind CSS                   | ^3.2.1  |
| Headless UI                    | ^2.0.0  |
| Axios                          | ^1.11.0 |
| Laravel Echo                   |  ^2.3.1 |
| Pusher JS                      |  ^8.4.3 |
| Canvas Confetti                |  ^1.9.4 |

### Dev / Testing
| Package                        | Version |
|--------------------------------|---------|
| Vitest                         | ^4.0.18 |
| Testing Library (React)        | ^16.3.2 |
| Testing Library (user-event)   | ^14.6.1 |
| Testing Library (jest-dom)     |  ^6.9.1 |
| jsdom                          | ^24.1.0 |
| @vitejs/plugin-react           |  ^4.2.0 |


<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework. You can also check out [Laravel Learn](https://laravel.com/learn), where you will be guided through building a modern Laravel application.

If you don't feel like reading, [Laracasts](https://laracasts.com) can help. Laracasts contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

## Laravel Sponsors

We would like to extend our thanks to the following sponsors for funding Laravel development. If you are interested in becoming a sponsor, please visit the [Laravel Partners program](https://partners.laravel.com).

### Premium Partners

- **[Vehikl](https://vehikl.com)**
- **[Tighten Co.](https://tighten.co)**
- **[Kirschbaum Development Group](https://kirschbaumdevelopment.com)**
- **[64 Robots](https://64robots.com)**
- **[Curotec](https://www.curotec.com/services/technologies/laravel)**
- **[DevSquad](https://devsquad.com/hire-laravel-developers)**
- **[Redberry](https://redberry.international/laravel-development)**
- **[Active Logic](https://activelogic.com)**

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
