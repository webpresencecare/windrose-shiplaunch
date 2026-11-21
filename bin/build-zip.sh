#!/bin/bash
# Builds the Windrose Suite distribution zip dist/windrose-suite.zip (root folder windrose/):
#   1. WordPress core, unmodified: the official zip from wordpress.org, every file checked against the checksums
#      wordpress.org publishes for that version (api.wordpress.org/core/checksums).
#   2. Windrose Helm, Anchors and Sabir in wp-content/plugins/: the latest GitHub release of each (asset <slug>.zip,
#      sha256 checked against the digest GitHub publishes), or the local working copies built with their own
#      bin/build-zip.sh (PLUGINS=local, for tests before a release).
#   3. The installer drop-in wp-content/install.php.
# Also writes dist/windrose-suite.txt (what is inside, for the release notes).
#
# Usage: bin/build-zip.sh [vX.Y.Z]
#   CORE=nightly (default: the 7.2 nightly) or CORE=<version> (for example 7.2 once released)
#   PLUGINS=release (default) or PLUGINS=local (working copies next to this one, in ../<slug>)
#   GH_TOKEN: optional, only to raise GitHub's limit for anonymous API calls (CI passes the workflow's own token).
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
# The download is named after the distribution (The Windrose Suite); this repository is Windrose Shiplaunch.
name=windrose-suite
plugins=(windrose-helm windrose-anchors windrose-sabir)
org=webpresencecare
core=${CORE:-nightly}
source_mode=${PLUGINS:-release}

version=$(grep -m1 -E '^[[:space:]]*\*[[:space:]]*Version:' wp-content/install.php | awk '{print $NF}')
constant=$(grep -m1 -E "define\( 'WINDROSE_SHIPLAUNCH_VERSION'" wp-content/install.php | sed -E "s/.*, '([^']+)'.*/\1/")
if [ "$version" != "$constant" ]; then
	echo "Version line ($version) and WINDROSE_SHIPLAUNCH_VERSION ($constant) differ in wp-content/install.php." >&2
	exit 1
fi
if [ "${1:-}" != "" ] && [ "v$version" != "$1" ]; then
	echo "Tag $1 does not match the installer version ($version)." >&2
	exit 1
fi

json() { python3 -I -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1], {'d': d}))" "$1"; }
github() {
	# GitHub API call (the Windrose repositories are public); GH_TOKEN only raises the rate limit.
	if [ -n "${GH_TOKEN:-}" ]; then
		curl -fsSL -H "Authorization: Bearer $GH_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28" -H "User-Agent: Windrose" "$@"
	else
		curl -fsSL -H "X-GitHub-Api-Version: 2022-11-28" -H "User-Agent: Windrose" "$@"
	fi
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/download" "$root/dist"

# 1. Core.
if [ "$core" = nightly ]; then
	core_url=https://wordpress.org/nightly-builds/wordpress-latest.zip
else
	core_url="https://downloads.wordpress.org/release/wordpress-$core.zip"
fi
echo "Core: $core_url"
curl -fsSL -o "$work/download/core.zip" "$core_url"
if [ "$core" != nightly ]; then
	expected=$(curl -fsSL "$core_url.sha1")
	actual=$(sha1sum "$work/download/core.zip" | cut -d' ' -f1)
	[ "$expected" = "$actual" ] || { echo "Core zip sha1 $actual does not match wordpress.org's $expected." >&2; exit 1; }
fi
unzip -q "$work/download/core.zip" -d "$work/unpacked"
[ -f "$work/unpacked/wordpress/wp-includes/version.php" ] || { echo "The core zip has no wordpress/ folder." >&2; exit 1; }
wp_version=$(sed -nE "s/^\\\$wp_version = '([^']+)';/\1/p" "$work/unpacked/wordpress/wp-includes/version.php")
echo "Core version: $wp_version"

curl -fsSL -o "$work/download/checksums.json" "https://api.wordpress.org/core/checksums/1.0/?version=$wp_version&locale=en_US"
python3 -I - "$work/download/checksums.json" "$work/unpacked/wordpress" << 'PY'
import hashlib, json, os, sys
data = json.load(open(sys.argv[1]))
sums = data.get('checksums')
if not isinstance(sums, dict) or not sums:
    sys.exit('wordpress.org has no checksums for this core version.')
base = sys.argv[2]
bad = [f for f, md5 in sums.items() if not os.path.isfile(os.path.join(base, f)) or hashlib.md5(open(os.path.join(base, f), 'rb').read()).hexdigest() != md5]
extra = []
for top, _, files in os.walk(base):
    for name in files:
        rel = os.path.relpath(os.path.join(top, name), base)
        if rel not in sums and not rel.startswith('wp-content/'):
            extra.append(rel)
if bad or extra:
    sys.exit('Core files differ from wordpress.org checksums: %s; files not in the checksums: %s' % (bad[:10], extra[:10]))
print('Core checksums: %d files match wordpress.org' % len(sums))
PY
mv "$work/unpacked/wordpress" "$work/windrose"
dest="$work/windrose/wp-content"

# 2. Windrose plugins.
manifest="$work/manifest.txt"
{
	echo "The Windrose Suite $version (installer: Windrose Shiplaunch)"
	echo "WordPress $wp_version (unmodified, checked against wordpress.org checksums)"
} > "$manifest"
for plugin in "${plugins[@]}"; do
	if [ "$source_mode" = local ]; then
		(cd "$root/../$plugin" && bash bin/build-zip.sh > /dev/null)
		cp "$root/../$plugin/dist/$plugin.zip" "$work/download/$plugin.zip"
		rm -f "$root/../$plugin/dist/$plugin.zip"
		plugin_version="$(grep -m1 -E '^[[:space:]]*\*[[:space:]]*Version:' "$root/../$plugin/$plugin.php" | awk '{print $NF}') (local working copy, not a release)"
	else
		github -o "$work/download/$plugin.json" "https://api.github.com/repos/$org/$plugin/releases/latest"
		tag=$(json "d['tag_name']" < "$work/download/$plugin.json")
		asset=$(json "next((a['url'] + ' ' + (a.get('digest') or '') for a in d['assets'] if a['name'] == '$plugin.zip' and a['state'] == 'uploaded'), '')" < "$work/download/$plugin.json")
		[ -n "$asset" ] || { echo "$plugin $tag has no uploaded $plugin.zip." >&2; exit 1; }
		read -r asset_url digest <<< "$asset"
		[[ "$digest" == sha256:* ]] || { echo "$plugin $tag: GitHub published no sha256 digest for $plugin.zip." >&2; exit 1; }
		github -H "Accept: application/octet-stream" -o "$work/download/$plugin.zip" "$asset_url"
		actual=$(sha256sum "$work/download/$plugin.zip" | cut -d' ' -f1)
		[ "sha256:$actual" = "$digest" ] || { echo "$plugin.zip sha256 $actual does not match GitHub's $digest." >&2; exit 1; }
		plugin_version="${tag#v} (GitHub release, sha256 $actual)"
	fi
	top=$(unzip -Z1 "$work/download/$plugin.zip" | cut -d/ -f1 | sort -u)
	[ "$top" = "$plugin" ] || { echo "$plugin.zip must hold one $plugin/ folder, not: $top" >&2; exit 1; }
	unzip -q "$work/download/$plugin.zip" -d "$dest/plugins"
	echo "$plugin $plugin_version" | tee -a "$manifest"
done

# 3. The installer drop-in.
cp wp-content/install.php "$dest/install.php"
# The commit's date, not the build's, so two builds of one tag (same core, same plugin releases) give the same bytes.
touch -d "@$(git log -1 --format=%ct)" "$dest/install.php"

rm -f "dist/$name.zip"
(cd "$work" && zip -qrX "$root/dist/$name.zip" windrose)
cp "$manifest" "dist/$name.txt"
echo "dist/$name.zip ($version, WordPress $wp_version): $(unzip -Z1 "dist/$name.zip" | wc -l) entries, sha256 $(sha256sum "dist/$name.zip" | cut -d' ' -f1)"
