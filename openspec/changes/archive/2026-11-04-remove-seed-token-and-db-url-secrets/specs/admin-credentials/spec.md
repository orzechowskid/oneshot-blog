## REMOVED Requirements

### Requirement: Seed route refuses when any user exists

**Reason**: The seed route only acts on an empty `users` table, so it can no
longer change a site that has its one admin account; the admin credential
pair and the reset command cover account creation and rotation.

**Migration**: Create an account with the reset command inside the machine;
rotate a credential with the reset command; no operator action is needed for
sites that already have an account.

## MODIFIED Requirements

### Requirement: Deployed machines can run the reset command
The deploy script SHALL store `ADMIN_EMAIL` and `ADMIN_PASSWORD` as Fly
secrets, SHALL print a line naming the app and the email it is storing. The
deploy script SHALL NOT write a `DATABASE_URL` secret and SHALL NOT write a
seed token.

#### Scenario: Laptop deploy stores the pair
- **WHEN** a laptop deploy finishes with both variables set
- **THEN** `fly secrets list` shows `ADMIN_EMAIL` and `ADMIN_PASSWORD` alongside `DATABASE_URL`
- **AND** the deploy output names the app and the stored email

## ADDED Requirements

### Requirement: No seed token
The repository SHALL contain no seed token, no seed route, and no seeding
step.

#### Scenario: Seed identifiers are gone from the repository
- **WHEN** `app/`, `scripts/`, `playwright.config.ts`, `.env.example`, `package.json`, and `README.md` are searched for `SEED_TOKEN` and for `internal/seed`
- **THEN** no match appears in any of them

#### Scenario: Deploy makes no seeded request
- **WHEN** the deploy script runs to completion
- **THEN** it performs no HTTP request that carries a seed credential

### Requirement: Deployed database address is set only by attach
No script SHALL write a `DATABASE_URL` secret for a deployed app. The only
mechanism that sets the deployed app's database address is `fly postgres
attach`. The deploy script decides from the deployed app's secret names; an
empty list is a valid read and means the attach step runs.

#### Scenario: Local database address does not become a deployed secret
- **WHEN** a deploy runs and the local environment contains a development `DATABASE_URL`
- **THEN** the deploy performs no secret write naming `DATABASE_URL`

#### Scenario: Existing deployed database address is not attached
- **WHEN** a deploy runs and the deployed app already holds a `DATABASE_URL` secret
- **THEN** the deploy script runs no `fly postgres attach` step

#### Scenario: Deployed app without a database address gets the attach
- **WHEN** a deploy runs and the deployed app holds no `DATABASE_URL` secret
- **THEN** the deploy script runs the `fly postgres attach` step

#### Scenario: Unreadable secret list refuses the deploy
- **WHEN** the deploy script asks the deployed app for its secret names and that request fails, returns text that is not JSON, or returns JSON that is not a list
- **THEN** the deploy script prints a message naming the command to run by hand, writes no secret, runs no attach, and exits with status 1

#### Scenario: Local use of the database address is unchanged
- **WHEN** local development, the database reset script, and the admin credential reset command run against the local `DATABASE_URL`
- **THEN** each of them keeps using the local `DATABASE_URL` from the local environment unchanged
