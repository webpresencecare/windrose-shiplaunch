#!/bin/bash
# Installs WordPress (the nightly build) and the WordPress test library, for PHPUnit on GitHub
# (.github/workflows/ci.yml) or locally.
# Usage: bin/install-wp-tests.sh <folder>
# Environment: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST; WP_DEVELOP_REF (wordpress-develop branch, default trunk:
# trunk is 7.2 until WordPress creates its 7.2 branch, around RC; then use 7.2 and the 7.2 nightly).
set -euo pipefail
dir=$1
ref=${WP_DEVELOP_REF:-trunk}
mkdir -p "$dir"
cd "$dir"

curl -fsSL -o wordpress.zip https://wordpress.org/nightly-builds/wordpress-latest.zip
unzip -q -o wordpress.zip

git clone --quiet --depth 1 --filter=blob:none --sparse --branch "$ref" https://github.com/WordPress/wordpress-develop.git develop
git -C develop sparse-checkout set tests/phpunit/includes tests/phpunit/data src/wp-content/themes/twentytwentyone
# A classic theme for the tests (the nightly ships block themes only).
cp -r develop/src/wp-content/themes/twentytwentyone wordpress/wp-content/themes/

sed -e "s#^define( 'ABSPATH'.*#define( 'ABSPATH', '$dir/wordpress/' );#" \
	-e "s/youremptytestdbnamehere/${DB_NAME}/" \
	-e "s/yourusernamehere/${DB_USER}/" \
	-e "s/yourpasswordhere/${DB_PASSWORD}/" \
	-e "s|localhost|${DB_HOST}|" \
	develop/wp-tests-config-sample.php > wp-tests-config.php

echo "WordPress $(grep -oP "wp_version = '\K[^']+" wordpress/wp-includes/version.php), test library wordpress-develop $ref $(git -C develop rev-parse --short HEAD)"
