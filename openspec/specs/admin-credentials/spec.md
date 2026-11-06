## Purpose

Defines how the blog's single admin account is created from environment
variables at server start, how its credential is reset outside the app, and
how the deploy script interacts with that account.

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
`ADMIN_EMAIL` and `ADMIN_PASSWORD` and lists which of the two are missing.
It SHALL NOT generate a random password and SHALL NOT print any generated
password.

#### Scenario: Missing pair
- **WHEN** the deploy script runs with `ADMIN_EMAIL` or `ADMIN_PASSWORD` unset
- **THEN** no deployment is performed, the output names both `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and it lists the missing variable, or both when both are missing

#### Scenario: Pair present
- **WHEN** the deploy script runs with both variables set
- **THEN** the deployment proceeds and no password value is printed

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

### Requirement: Deploy stores the credential pair for each environment
The deploy script SHALL run only from the continuous integration pipeline,
with an explicit environment name. For the environment it names, the deploy
script SHALL store that environment's `ADMIN_EMAIL` and `ADMIN_PASSWORD` as
Fly secrets on that environment's own app: `danorz-com-blog-prod` for
production and `danorz-com-blog-stage` for pre-production. It SHALL print a
line naming the app and the admin address it is storing, and its output
SHALL contain no password value. The deploy script SHALL NOT write a
`DATABASE_URL` secret and SHALL NOT write a seed token.

#### Scenario: Pipeline deploy stores the pair
- **WHEN** a pipeline deploy finishes with both variables set for its environment
- **THEN** `flyctl secrets list --app <app>` shows `ADMIN_EMAIL` and `ADMIN_PASSWORD` alongside `DATABASE_URL`
- **AND** the deploy output names the app and the stored admin address

#### Scenario: Production pipeline stores the production pair
- **WHEN** the production pipeline finishes a deploy of `danorz-com-blog-prod` with `ADMIN_EMAIL_PROD` and `ADMIN_PASSWORD_PROD` set
- **THEN** `flyctl secrets list --app danorz-com-blog-prod` shows `ADMIN_EMAIL` and `ADMIN_PASSWORD` alongside `DATABASE_URL`
- **AND** the deploy output names `danorz-com-blog-prod` and the stored admin address

#### Scenario: Pre-production pipeline stores the pre-production pair
- **WHEN** the pre-production pipeline finishes a deploy of `danorz-com-blog-stage` with `ADMIN_EMAIL_STAGE` and `ADMIN_PASSWORD_STAGE` set
- **THEN** `flyctl secrets list --app danorz-com-blog-stage` shows `ADMIN_EMAIL` and `ADMIN_PASSWORD` alongside `DATABASE_URL`
- **AND** the deploy output names `danorz-com-blog-stage` and the stored admin address

#### Scenario: Deploy output names the app and the admin address, never the password
- **WHEN** the log of a completed production deploy is read with `gh run view <run-id> --log`
- **THEN** the log contains `danorz-com-blog-prod` and the admin address from `admin-creds.dotenv`
- **AND** after `set -a; . ./admin-creds.dotenv; set +a`, the command `gh run view <run-id> --log | grep -F "$ADMIN_PASSWORD"` finds no match
- **AND** the same two checks, with the pre-production run, `admin-creds-stage.dotenv`, and `danorz-com-blog-stage`, give the same result

### Requirement: Deploy names its environment
The deploy script SHALL take the environment name as a required argument and
SHALL NOT default to an environment. It SHALL accept exactly two names:
`prod` and `stage`. When no environment name is given, or the name is not
one of the two, the deploy script SHALL refuse to run: it SHALL print the
two accepted names and exit with status 1. The deploy script's first read of
the deployed world SHALL be the app's own status, `flyctl status --app <app>
--json`, where `<app>` is the app of the environment named. When that read
is unreadable — the command exits with a status that is neither success nor
the app-missing error, or it prints output that is not parseable JSON — the
deploy script SHALL refuse: it SHALL print a hand-run instruction naming
`flyctl status --app <app> --json` with the real app name, exit with status
1, and write nothing: no app is created, no database is attached, no secret
is written, and nothing is deployed.

#### Scenario: No environment name is refused
- **WHEN** the deploy script runs with no environment argument
- **THEN** it exits with status 1, performs no deploy, and prints the two accepted names, `prod` and `stage`

#### Scenario: A name outside the two is refused
- **WHEN** the deploy script runs with an environment argument that is neither `prod` nor `stage`
- **THEN** it exits with status 1, performs no deploy, and prints the two accepted names, `prod` and `stage`

#### Scenario: An unreadable status read refuses and writes nothing
- **WHEN** `flyctl status --app <app> --json` for the named environment's app exits with a status that is neither success nor the app-missing error, or prints output that is not parseable JSON
- **THEN** the deploy script prints a hand-run instruction naming `flyctl status --app <app> --json` with the real app name, exits with status 1, and writes nothing: no app is created, no database is attached, no secret is written, and nothing is deployed

### Requirement: Local development credential pair is local only
The local development admin credential pair SHALL be generated locally by
the setup script and written to `.env`. It SHALL NOT be the production
credential pair. The production credential value SHALL appear in no file in
the repository outside `admin-creds.dotenv`, `admin-creds-stage.dotenv`, and
`.env`.

#### Scenario: Local pair differs from the production pair
- **WHEN** the setup script generates the local pair into `.env`
- **THEN** the `ADMIN_EMAIL` value in `.env` differs from the `ADMIN_EMAIL` value in `admin-creds.dotenv`
- **AND** the `ADMIN_PASSWORD` value in `.env` differs from the `ADMIN_PASSWORD` value in `admin-creds.dotenv`

#### Scenario: No file outside the credential files holds the production credential
- **WHEN** `set -a; . ./admin-creds.dotenv; set +a` is run, followed by `git ls-files -z | xargs -0 -r grep -lF "$ADMIN_PASSWORD"`
- **THEN** the command lists no file and exits with status 1: no tracked file holds the production password, so the only files that can contain it are the untracked `admin-creds.dotenv`, `admin-creds-stage.dotenv`, and `.env`

### Requirement: Each environment stores its own credential pair
The production pipeline SHALL load the credential pair from the production
source `admin-creds.dotenv`, through the repository secrets
`ADMIN_EMAIL_PROD` and `ADMIN_PASSWORD_PROD`, and SHALL store it on
`danorz-com-blog-prod` only. The pre-production pipeline SHALL load the
credential pair from the pre-production source
`admin-creds-stage.dotenv`, through the repository secrets
`ADMIN_EMAIL_STAGE` and `ADMIN_PASSWORD_STAGE`, and SHALL store it on
`danorz-com-blog-stage` only. No environment SHALL store the other
environment's credential pair.

#### Scenario: Production sign-in uses the production credential file
- **WHEN** `set -a; . ./admin-creds.dotenv; set +a` is run, followed by `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" https://danorz-com-blog-prod.fly.dev/login`
- **THEN** the command prints `302 /admin`

#### Scenario: Pre-production sign-in uses the pre-production credential file
- **WHEN** `set -a; . ./admin-creds-stage.dotenv; set +a` is run, followed by `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" https://danorz-com-blog-stage.fly.dev/login`
- **THEN** the command prints `302 /admin`
