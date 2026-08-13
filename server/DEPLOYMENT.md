# Traceability single-host deployment

This deployment runs the server API, dispatcher, worker, PostgreSQL, Redis,
and MinIO in the production Compose file on one Ubuntu host.

The host keeps its checkout and runtime state under `/opt/traceability`:

```text
/opt/traceability/
├── .env                 # root-owned, mode 600; never commit this file
├── current/             # symlink to the latest uploaded source release
└── releases/            # uploaded source releases
```

## First-time host setup

Install Docker Engine, Docker Compose, Git, and curl. Then create the runtime
environment file:

```bash
install -d -m 0755 /opt/traceability
install -m 0600 /dev/null /opt/traceability/.env
```

At minimum, set these values in `/opt/traceability/.env`:

```env
TRACEABILITY_PORT=3000
PUBLIC_INGEST_URL=http://119.29.145.158:3000
POSTGRES_DB=traceability
POSTGRES_USER=traceability
POSTGRES_PASSWORD=<random-value>
MINIO_ROOT_USER=<random-value>
MINIO_ROOT_PASSWORD=<random-value>
JWT_SECRET=<random-value-at-least-32-characters>
```

The database, Redis, and MinIO services do not publish host ports. Only the
API port is published, so the Tencent Cloud firewall should expose TCP `3000`
only for the current IP-based test phase.

## Manual deployment

The deployment script is safe for a host that may later run other services:
it only operates on the `traceability` Compose project and a source release
under `/opt/traceability`.

```bash
TRACEABILITY_REPO_DIR=/opt/traceability/current \
  /opt/traceability/current/server/scripts/deploy.sh
```

The GitHub Actions job creates and uploads the source release. The script then
validates Compose configuration, builds the image, runs the migration
dependency, starts API/dispatcher/worker, and waits for `GET /health/ready`
before returning success. The server does not need outbound access to GitHub.

## GitHub Actions secrets

The server deployment workflow requires:

| Secret             | Value                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| `SERVER_HOST`      | `119.29.145.158`                                                        |
| `SERVER_USER`      | `root` for the initial bootstrap; use a restricted deploy user later    |
| `SERVER_PORT`      | `22`                                                                    |
| `SERVER_SSH_KEY`   | private key used by GitHub Actions to reach the host                    |
| `TRACEABILITY_DSN` | optional Electron monitoring DSN; leave unset to disable app monitoring |

For the initial bootstrap, the deploy key must be installed on the host and
the first deployment can be run manually over the local SSH alias. Do not put
the server `.env` or its database/JWT/MinIO secrets in the repository.
