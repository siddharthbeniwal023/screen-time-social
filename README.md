# Screen Time Social

A fast MVP for sharing screen-time habits with accepted friends. The repository contains:

- `mobile/ScreenTimeSocial`: React Native app for iOS and Android
- `server`: Java 21 + Spring Boot API

## What works now

- Today dashboard, top-app breakdown, weekly chart, and friend leaderboard
- Email/password registration and login with BCrypt password hashes, signed access tokens, and rotating refresh tokens
- PostgreSQL persistence managed by Flyway migrations
- Unique username editing and username-based friend discovery UI
- Friend request, inbox, and acceptance flow
- Friend request decline, friend removal, and native username sharing
- Private comparison groups with invite-code sharing, member leave, and owner deletion
- Privacy boundary: the circle API only includes the viewer and accepted friends
- Per-account app-breakdown privacy while daily totals remain shareable
- In-app account deletion with database-cascaded cleanup
- Server-derived identity: protected routes use the verified JWT subject and accept no acting-user ID
- Keychain/Keystore-backed mobile sessions that restore on launch and revoke on sign-out
- Per-IP rate limits for authentication, token refresh, and username lookup
- A public, detail-free health endpoint at `/actuator/health`
- Android Usage Access permission flow and native `UsageStatsManager` bridge
- Authenticated Android daily-usage sync
- Pull-to-refresh on every main tab, app-resume refresh, request timeouts, and offline session restoration
- Demo screen-time data, so the dashboard can be explored before platform access is configured

## Run the mobile app

The project requires Node 22.11 or newer, Xcode for iOS, and Android Studio for Android.

```bash
cd mobile/ScreenTimeSocial
npm install
npm start
```

In a second terminal:

```bash
npm run android
# or
npm run ios
```

On Android, tap **Connect your screen time**, open Usage Access, and enable Screen Time Social. Return to the app and tap the card again to load the device data.

## Run the Spring Boot API

Use Java 21 or newer. Start PostgreSQL from the repository root:

```bash
docker compose up -d postgres
```

If Docker is not installed, use Homebrew on macOS instead:

```bash
brew install postgresql@17
brew services start postgresql@17
```

For the first Homebrew setup, create the role and database expected by the development defaults:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql -d postgres \
  -c "CREATE ROLE screen_time_social LOGIN PASSWORD 'screen_time_social'" \
  -c "CREATE DATABASE screen_time_social OWNER screen_time_social"
```

The local Compose credentials match the development defaults. For any shared or deployed environment,
copy `.env.example` to `.env`, replace both secrets, and provide those environment variables to the API.
The API intentionally refuses to start without a `JWT_SECRET` of at least 32 bytes. For local development:

```bash
export JWT_SECRET='local-development-secret-change-me-123456'
```

Maven and Gradle build definitions are both included. With Maven:

```bash
cd server
mvn spring-boot:run
```

Or, from the repository root, reuse the Android project's Gradle wrapper:

```bash
mobile/ScreenTimeSocial/android/gradlew -p server bootRun
```

To build the API and PostgreSQL together in containers, set `JWT_SECRET` and enable the API profile:

```bash
docker compose --profile api up --build
```

The API starts at `http://localhost:8080/api/v1`; accounts are created through the app or registration endpoint.
Create two accounts in the app to exercise the friend-request and acceptance flow. Android emulators
use `10.0.2.2` to reach the host API; iOS simulators use `localhost`. For a physical phone, update
`mobile/ScreenTimeSocial/src/api.ts` to your development machine's LAN address.

The mobile client stores its access and refresh tokens through `react-native-keychain`, backed by the
iOS Keychain and Android Keystore. It restores the session on launch, automatically rotates an expired
access token, and revokes the refresh token on sign-out.

Useful endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an account and receive an access/refresh token pair |
| `POST` | `/auth/login` | Authenticate and receive an access/refresh token pair |
| `POST` | `/auth/refresh` | Rotate a refresh token and receive a new token pair |
| `POST` | `/auth/logout` | Revoke a refresh token |
| `GET` | `/usernames/{username}/availability` | Check username availability |
| `GET` | `/users/search?username=...` | Find the exact username |
| `GET` | `/me` | Get the authenticated profile |
| `DELETE` | `/me` | Permanently delete the authenticated account and its data |
| `PATCH` | `/me/username` | Change the authenticated user's username |
| `PATCH` | `/me/privacy` | Toggle app-breakdown sharing |
| `POST` | `/friend-requests` | Send a request |
| `GET` | `/me/friend-requests` | Get incoming requests |
| `POST` | `/friend-requests/{id}/accept` | Accept a request |
| `POST` | `/friend-requests/{id}/decline` | Decline a request |
| `DELETE` | `/friends/{userId}` | Remove an accepted friend |
| `POST` | `/me/usage` | Upload the authenticated user's daily aggregate |
| `GET` | `/me/circle?date=YYYY-MM-DD` | Get the accepted-friends leaderboard |
| `POST` | `/groups` | Create a private comparison group |
| `POST` | `/groups/join` | Join a group with an invite code |
| `GET` | `/me/groups?date=YYYY-MM-DD` | List the authenticated user's groups |
| `DELETE` | `/groups/{id}` | Leave a group, or delete it when called by its owner |
| `GET` | `/actuator/health` | Check API and database health without exposing details |

Except for registration, login, and username availability, endpoints require
`Authorization: Bearer <access-token>`.

## Database and authentication design

- Flyway owns the schema in `server/src/main/resources/db/migration`.
- PostgreSQL enforces normalized unique emails, normalized unique usernames, one daily aggregate per user,
  and one active friendship per unordered user pair.
- Passwords are BCrypt-hashed with cost 12 and are never returned by the API.
- Access tokens use HS256, expire after one hour by default, and identify the user through the immutable UUID
  in the token subject. Set `JWT_SECRET` to at least 32 random bytes outside development.
- Refresh tokens are opaque random values, expire after 30 days by default, and are stored only as SHA-256
  hashes in PostgreSQL. Every refresh rotates the token; reused and signed-out tokens are rejected.
- The client never sends a requester, profile, usage-owner, or circle-viewer ID. Controllers derive all of
  those values from the verified token.
- App-level usage is omitted from friend and group responses when its owner disables breakdown sharing.
  The owner can always see their own details.
- Authentication and username-discovery limits are configurable through the variables in `.env.example`.
  The current limiter is intentionally in-process for the MVP; use a shared Redis-backed limiter when the
  API runs on multiple instances.

## Verify the project

```bash
# Backend integration tests
mobile/ScreenTimeSocial/android/gradlew -p server test

# Mobile static checks and render test
cd mobile/ScreenTimeSocial
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

Android release builds are intentionally not signed with the checked-in debug key. Configure the private
release keystore in the publishing pipeline before producing a Play Store artifact.

## iOS screen-time access

iOS needs a native Screen Time integration and Apple-approved capabilities before real app-level data can replace the demo data:

1. Join the Apple Developer Program and request the **Family Controls** distribution entitlement for the app and every Screen Time extension.
2. Enable **Family Controls App and Website Usage** if the app needs identifiers and usage information, and obtain the person's explicit authorization.
3. Add a Device Activity Report extension plus a small Swift bridge for React Native.
4. Keep the app useful if authorization is denied; sharing must remain opt-in.

## Before a public beta

Run PostgreSQL as a managed, backed-up service; require HTTPS; rotate the development database and JWT
secrets; add email verification and password reset; move rate-limit state to Redis when horizontally scaling;
and add Apple/Google sign-in. Real iOS usage collection still requires Apple approval and the Family Controls
entitlements described above.
