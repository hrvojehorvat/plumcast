#!/usr/bin/env bash
# One-time: creates the Plumcast release signing key and stores it in the repo's GitHub secrets.
# Run it yourself from the repo root:  bash apps/plumcast/scripts/release-keystore.sh
# - The keystore is written OUTSIDE the repo (~/plumcast-signing/). Back it up together with the password
#   (password manager). Lose either and you can never ship an update to installed apps again.
# - Nothing secret is printed. The password is asked for twice and goes to the secrets via stdin.
set -euo pipefail

dir="$HOME/plumcast-signing"
store="$dir/plumcast-release.jks"
alias=plumcast

command -v keytool >/dev/null || { echo "keytool not found (install a JDK)"; exit 1; }
command -v gh >/dev/null || { echo "gh not found"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first"; exit 1; }

if [ -e "$store" ]; then
  echo "$store already exists - using it (not creating a new key)."
else
  read -rsp "New keystore password (min 8 chars): " pw; echo
  read -rsp "Repeat password: " pw2; echo
  [ "$pw" = "$pw2" ] || { echo "Passwords differ"; exit 1; }
  [ ${#pw} -ge 8 ] || { echo "Too short"; exit 1; }
  mkdir -p "$dir" && chmod 700 "$dir"
  PW="$pw" keytool -genkeypair -storetype PKCS12 -keystore "$store" -alias "$alias" \
    -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Plumcast, O=mrvoje" \
    -storepass:env PW -keypass:env PW >/dev/null
  chmod 600 "$store"
  echo "Created $store"
fi
if [ -z "${pw:-}" ]; then read -rsp "Keystore password: " pw; echo; fi
PW="$pw" keytool -list -keystore "$store" -storepass:env PW -alias "$alias" >/dev/null || { echo "Wrong password"; exit 1; }

base64 -i "$store" | gh secret set PLUMCAST_KEYSTORE_BASE64
printf '%s' "$pw" | gh secret set PLUMCAST_KEYSTORE_PASSWORD
printf '%s' "$pw" | gh secret set PLUMCAST_KEY_PASSWORD
printf '%s' "$alias" | gh secret set PLUMCAST_KEY_ALIAS
echo "Done: 4 PLUMCAST_* secrets set. Now back up $store and its password."
