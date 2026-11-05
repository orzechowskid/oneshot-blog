## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Deployed machines can run the reset command

**Reason**: The content of this requirement is deploy behaviour, not
machine behaviour, and this change moves the deploy to the pipeline with an
explicit environment name covering both environments. It is re-issued under
the deploy-behaviour name.

**Migration**: No operator action. The re-issued requirement "Deploy stores
the credential pair for each environment" keeps the storage rule and the
refusal of a `DATABASE_URL` secret and a seed token; its one scenario is
re-issued as "Pipeline deploy stores the pair".

## ADDED Requirements

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
