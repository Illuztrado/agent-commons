#!/usr/bin/env bash
#
# Deploy Agent Commons to Cloud Run, from a project id and nothing else.
#
#   ./scripts/deploy-cloudrun.sh YOUR_PROJECT_ID
#
# Every step is idempotent: running it twice is safe, and it can be re-run after
# a failure without unpicking anything. It does not touch billing — that has to
# exist before this script runs, and there is no way around it.
#
# What it does, in order: check the caller is authenticated, pin the project,
# enable the four APIs, create the Firestore database if there is not one,
# deploy, then print the URL to hand to scripts/verify-deploy.mjs.
set -euo pipefail

GCLOUD="${GCLOUD:-$(command -v gcloud || echo "$HOME/google-cloud-sdk/bin/gcloud")}"
PROJECT="${1:-}"
REGION="asia-east1"
SERVICE="agent-commons"

if [[ -z "$PROJECT" ]]; then
  echo "usage: $0 YOUR_PROJECT_ID" >&2
  exit 2
fi

echo "== 0. authenticated as =="
ACCOUNT="$("$GCLOUD" auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
if [[ -z "$ACCOUNT" ]]; then
  echo "No active gcloud account. Run: $GCLOUD auth login" >&2
  exit 1
fi
echo "$ACCOUNT"

echo "== 1. project =="
"$GCLOUD" config set project "$PROJECT" --quiet
# Fail loudly here rather than four steps later: an unbilled project is the one
# thing this script cannot fix.
BILLING="$("$GCLOUD" billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || echo unknown)"
if [[ "$BILLING" != "True" ]]; then
  echo "WARNING: billing does not look enabled on $PROJECT (got: $BILLING)." >&2
  echo "         Cloud Run will refuse to deploy. Continuing anyway, so the error is explicit." >&2
fi

echo "== 2. enable APIs =="
"$GCLOUD" services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  --project "$PROJECT"

echo "== 3. Firestore database =="
if "$GCLOUD" firestore databases describe --database="(default)" --project "$PROJECT" >/dev/null 2>&1; then
  echo "already exists, leaving it alone"
else
  # Location is permanent. asia-east1 matches the Cloud Run region.
  "$GCLOUD" firestore databases create \
    --location="$REGION" \
    --type=firestore-native \
    --project "$PROJECT"
fi

echo "== 4. deploy =="
# 1Gi rather than the 512Mi in the runbook: Next.js SSR plus firebase-admin/grpc
# is close enough to the line that a cold start could be killed for memory, and
# this is not the moment to find out. The difference in cost is fractions of a cent.
#
# --allow-unauthenticated  the organisers require judges to open the link directly
# --max-instances 1        sign-off history is still process memory; see runbook
# TRANSPORT=firestore      otherwise Firestore is installed, not used
"$GCLOUD" run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 1 \
  --set-env-vars "TRANSPORT=firestore,FIRESTORE_PROJECT_ID=${PROJECT},FIRESTORE_COLLECTION=agent_commons" \
  --quiet

echo "== 5. url =="
URL="$("$GCLOUD" run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo "$URL"
echo
echo "Next: node scripts/verify-deploy.mjs $URL"
