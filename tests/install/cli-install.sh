#!/bin/bash
# Installs the distribution zip with WP-CLI (`wp core install` runs the same drop-in as the installer screens) and
# checks the network it leaves. Used by CI (ci.yml) and locally; the folder and the
# database are emptied first and belong to this test only.
# Usage: tests/install/cli-install.sh <zip> <folder> <url>
# Environment: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST (an empty database the test may fill).
set -euo pipefail
zip=$1
dir=$2
url=$3
fail() { echo "FAILED: $*" >&2; exit 1; }

rm -rf "$dir"
work=$(mktemp -d)
unzip -q "$zip" -d "$work"
mv "$work/windrose" "$dir"
rmdir "$work"
cd "$dir"
[ -f wp-content/install.php ] || fail "the zip has no wp-content/install.php"

wp config create --dbname="$DB_NAME" --dbuser="$DB_USER" --dbpass="$DB_PASSWORD" --dbhost="$DB_HOST" --skip-check --quiet
wp config set WP_DEBUG true --raw --quiet
wp config set WP_DEBUG_LOG true --raw --quiet
wp config set WP_DEBUG_DISPLAY false --raw --quiet
wp db reset --yes --quiet
output=$(wp core install --url="$url" --title="Windrose CLI" --admin_user=owner --admin_email=owner@example.com --admin_password="cli-$RANDOM-$RANDOM" --skip-email 2>&1)
echo "$output"
grep -q "Windrose: The Windrose Suite turned this site into a network" <<< "$output" || fail "no report from the drop-in"

[ ! -e wp-content/install.php ] || fail "the drop-in is still there"
grep -q "define( 'MULTISITE', true );" wp-config.php || fail "MULTISITE missing in wp-config.php"
grep -q "define( 'SUBDOMAIN_INSTALL', false );" wp-config.php || fail "SUBDOMAIN_INSTALL missing in wp-config.php"
grep -q "RewriteRule ^(\[_0-9a-zA-Z-\]+/)?wp-admin\$ \$1wp-admin/ \[R=301,L\]" .htaccess || fail ".htaccess has no network rules"
[ "$(wp eval 'echo is_multisite() ? "yes" : "no";')" = yes ] || fail "not a network"
[ "$(wp plugin list --status=active-network --field=name)" = windrose-helm ] || fail "Windrose Helm is not network-active"
[ "$(wp eval 'echo get_site_option( "windrose_helm_setup" )["status"] ?? "";')" = pending ] || fail "set-up not pending"
[ "$(wp super-admin list)" = owner ] || fail "owner is not super admin"
wp site create --slug=second --title=Second --quiet
[ "$(wp site list --field=url | wc -l)" = 2 ] || fail "a second site could not be created"
[ "$(wp eval 'echo get_option( "permalink_structure" );')" = "/blog/%year%/%monthnum%/%day%/%postname%/" ] || fail "main site permalinks"
if [ -s wp-content/debug.log ]; then cat wp-content/debug.log; fail "debug.log is not empty"; fi
echo "CLI INSTALL PASSED: $(wp core version) network at $url, drop-in gone, Windrose Helm active, set-up pending"
