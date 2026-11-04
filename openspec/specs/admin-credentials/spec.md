## Purpose

Defines how the blog's single admin account is created from environment
variables at server start, how its credential is reset outside the app, and
how the deploy script and the seed route interact with that account.

## Requirements

### Requirement: Admin account creation at server start
When the server starts and the `users` table is empty, the server SHALL
create exactly one admin user row using `ADMIN_EMAIL` and
`ADMIN_PASSWORD`, storing the email address and a hash of the password.
The operator SHALL be able to log in with that email and password. When the
`users` table already holds one or more rows, server start SHALL NOT create,
modify, or remove any user row.

#### Scenario: Fresh database with both variables set
- **WHEN** the server starts with an empty `users` table and both `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set to valid values
- **THEN** `users` holds exactly one row with that email address
- **AND** logging in with that email and password succeeds

#### Scenario: Existing account is left alone
- **WHEN** the server starts and `users` already holds one or more rows
- **THEN** server start completes without adding, modifying, or removing any user row

### Requirement: Silent skip when the password variable is unset
When `ADMIN_PASSWORD` is unset at server start, the server SHALL skip admin
account creation: it SHALL NOT write any user row and SHALL NOT raise an
error. The server SHALL start normally.

#### Scenario: Password variable unset on a fresh database
- **WHEN** the server starts with an empty `users` table and `ADMIN_PASSWORD` is unset
- **THEN** `users` remains empty, no error is raised, and the server starts

### Requirement: Only ADMIN_EMAIL and ADMIN_PASSWORD are read
The application and its scripts SHALL read the admin credential only from
`ADMIN_EMAIL` and `ADMIN_PASSWORD`. The old variable names
`BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD`, `OWNER_EMAIL`, and
`OWNER_PASSWORD` SHALL NOT be read by any application code, script, test,
or document that configures the credential.

#### Scenario: Old names have no effect
- **WHEN** the server starts with an empty `users` table, only `OWNER_EMAIL` and `OWNER_PASSWORD` are set, and `ADMIN_EMAIL` and `ADMIN_PASSWORD` are unset
- **THEN** no admin user row is created

#### Scenario: Old names are gone from the codebase
- **WHEN** `app/`, `scripts/`, `playwright.config.ts`, `.env.example`, and `README.md` are searched with `grep -rn 'BOOTSTRAP_\|OWNER_'`
- **THEN** no match appears in any of them

### Requirement: Admin password length rule
The admin password SHALL be between 12 and 200 characters, inclusive. A
password shorter than 12 characters or longer than 200 characters SHALL be
rejected both by admin account creation at server start and by the reset
command, and the rejection SHALL leave the `users` table unchanged. The
operator-facing length message SHALL read "admin password": the check at
`app/lib/validation.ts:134` changes from "Use at least 12 characters for the
owner password." to "Use at least 12 characters for the admin password."

#### Scenario: Server start rejects a short password
- **WHEN** the server starts with an empty `users` table and an `ADMIN_PASSWORD` of 11 characters
- **THEN** the first request that touches the database fails with an error naming `ADMIN_PASSWORD` and `users` stays empty
- **AND** the error message reads `ADMIN_PASSWORD is invalid: Use at least 12 characters for the admin password.`

#### Scenario: A short password is rejected
- **WHEN** the reset command runs with `ADMIN_PASSWORD` set to 11 characters and `users` holds one row
- **THEN** the command reports an error and the row is unchanged

#### Scenario: A long password is rejected
- **WHEN** the reset command runs with `ADMIN_PASSWORD` set to 201 characters
- **THEN** the command reports an error and no user row is changed

#### Scenario: Boundary lengths are accepted
- **WHEN** the reset command runs with `ADMIN_PASSWORD` set to exactly 12 or exactly 200 characters
- **THEN** the password is accepted and the account is written or updated

### Requirement: Admin credential reset command
The reset command, runnable as `npm run owner:reset`, SHALL read
`DATABASE_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from the environment
only; the password SHALL NOT be accepted as a command-line argument. The
command SHALL write both the email address and the password hash of the
admin account: when `users` holds zero rows it SHALL insert one admin row;
when `users` holds exactly one row it SHALL update that row to the new email
address and password hash; when `users` holds more than one row it SHALL
stop with an error and change nothing.

#### Scenario: Insert on an empty database
- **WHEN** the reset command runs and `users` holds zero rows
- **THEN** `users` holds exactly one row with the new email address
- **AND** logging in with the new credential succeeds

#### Scenario: Update the single row
- **WHEN** the reset command runs and `users` holds exactly one row with a different email address or password
- **THEN** that row holds the new email address and a hash of the new password
- **AND** login with the old credential fails and login with the new credential succeeds

#### Scenario: Refuse on more than one row
- **WHEN** the reset command runs and `users` holds two or more rows
- **THEN** the command stops with an error and no user row is changed

#### Scenario: Reset command is missing a variable
- **WHEN** the reset command runs with `ADMIN_PASSWORD` unset
- **THEN** it exits 1, prints an error naming `ADMIN_PASSWORD`, and no user row is changed

#### Scenario: Password is never taken from the command line
- **WHEN** the reset command runs with the password passed as a command-line argument and `ADMIN_PASSWORD` unset
- **THEN** it exits 1 with an error naming `ADMIN_PASSWORD`, the argument is not used, and no user row is changed

#### Scenario: Prints the email, never the password
- **WHEN** the reset command completes successfully
- **THEN** its output names the resulting email address and never contains the password value

#### Scenario: Stored email is lowercased
- **WHEN** the reset command runs with an `ADMIN_EMAIL` containing uppercase letters and `users` holds one row
- **THEN** the row holds the lowercased email address and a hash of the password

### Requirement: Reset leaves sessions untouched
A reset SHALL NOT delete, invalidate, or modify any existing session. A
session that was valid before the reset SHALL remain valid after it.

#### Scenario: Existing login survives a reset
- **WHEN** a browser session is logged in as the admin account and the reset command then updates the credential
- **THEN** the existing session continues to work without re-login

### Requirement: Deploy refuses without the credential pair
The deploy script SHALL refuse to deploy when `ADMIN_EMAIL` or
`ADMIN_PASSWORD` is unset, and SHALL print an instruction that names both
`ADMIN_EMAIL` and `ADMIN_PASSWORD`. It SHALL NOT generate a random password
and SHALL NOT print any generated password.

#### Scenario: Missing pair
- **WHEN** the deploy script runs with `ADMIN_EMAIL` or `ADMIN_PASSWORD` unset
- **THEN** no deployment is performed and the output names both `ADMIN_EMAIL` and `ADMIN_PASSWORD`

#### Scenario: Pair present
- **WHEN** the deploy script runs with both variables set
- **THEN** the deployment proceeds and no password value is printed

### Requirement: Deployed machines can run the reset command
The deploy script SHALL store `ADMIN_EMAIL` and `ADMIN_PASSWORD` as Fly
secrets, SHALL print a line naming the app and the email it is storing, and
SHALL NOT change `SEED_TOKEN` or `DATABASE_URL`.

#### Scenario: Laptop deploy stores the pair
- **WHEN** a laptop deploy finishes with both variables set
- **THEN** `fly secrets list` shows `ADMIN_EMAIL` and `ADMIN_PASSWORD` alongside `DATABASE_URL` and `SEED_TOKEN`
- **AND** the deploy output names the app and the stored email

### Requirement: No default owner email
The application code and scripts SHALL NOT contain a default of
`owner@example.com`. This change removes all five existing defaults, the
fifth being the installer prompt default at `scripts/install.ts:260`. Fixed
test credentials SHALL appear only in files under `tests/integration/`, where
a fixed test account is intended. The unit-test fixture emails inside `app/`
SHALL keep the neutral address `reader@example.com`, so the `app/` tree
contains no `owner@example.com` string.

#### Scenario: Search for the default email
- **WHEN** `app/`, `scripts/`, `playwright.config.ts`, `.env.example`, and `README.md` are searched with `grep -rn 'owner@example.com'`
- **THEN** no match appears in any of the five searched paths
- **AND** every match under `tests/` is inside a file under `tests/integration/`, where it is a test fixture, not a default

### Requirement: Seed route refuses when any user exists
`POST /internal/seed` SHALL return HTTP 409 and SHALL NOT create or modify
any user row when the `users` table holds one or more rows, so the seed
route can never rotate or overwrite the admin credential. This behaviour
SHALL stay unchanged by this change.

#### Scenario: Seed after an admin account exists
- **WHEN** the `users` table holds the admin row and a request is sent to `POST /internal/seed` with a valid seed token
- **THEN** the response status is 409
- **AND** the users table is unchanged
