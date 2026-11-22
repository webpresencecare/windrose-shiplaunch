# Windrose Shiplaunch

> Part of **[the Windrose Suite](https://www.webpresencecare.com/windrose/)**: WordPress for networks of sites, private by default, multilingual if you want it, free for everyone. Each Windrose plugin and theme works on its own.

The distribution zip of **the Windrose Suite** and its installer: WordPress core, unmodified, plus the Windrose plugins and a drop-in that turns the new installation into a network of sites. After logging in, Windrose Helm's **Set up** screen offers the remaining choices (addresses, languages, plugins, privacy).

Requires PHP 8.4 and WordPress 7.2 (the zip carries the 7.2 nightly until 7.2 ships).

User documentation: [docs/install.md](docs/install.md) (new installations), [docs/existing-networks.md](docs/existing-networks.md) (the plugins on a network that already exists).

## What the zip holds

`windrose-suite.zip`, root folder `windrose/`:

| Part | Source | Checked |
|---|---|---|
| WordPress core | The official zip from wordpress.org (`CORE=nightly` or a version) | Every file against the md5 checksums wordpress.org publishes for that version; no file outside `wp-content/` may be missing or extra |
| Windrose Helm, Windrose Anchors, Windrose Sabir (`wp-content/plugins/`) | The latest GitHub release of each (`<slug>.zip`) | sha256 against the digest GitHub publishes for the asset; one `<slug>/` root folder |
| `wp-content/install.php` | This repository | |

Core's own bundled themes and plugins stay as shipped (Windrose Helm hides classic themes). Multisite Language Switcher is not in the zip: the Set up screen installs it from wordpress.org when the network is multilingual. `windrose-suite.txt` next to the zip lists the versions inside.

## The installer drop-in

WordPress loads `wp-content/install.php` from `wp-admin/includes/upgrade.php`, which about ten admin files include, so the drop-in only defines functions and hooks core's `wp_install` action (fired once, at the end of core's installation: the installer screens and `wp core install`). It replaces no core function. In that action:

1. Refuses addresses with a port other than 80 or 443, or without a usable host name (the site then stays a single site, and the "Success!" page says why).
2. Sets the multisite table names on `$wpdb`, `install_network()`, `populate_network()` (subdirectories; the administrator becomes super admin).
3. Writes the installer's language as the network language, network-activates Windrose Helm and stores `windrose_helm_setup` (status `pending`), directly in the network meta table (the site is not a network yet in that request).
4. Writes the six multisite constants into `wp-config.php` above "That's all, stop editing!" (or above the `wp-settings.php` line); never when a network constant is already there.
5. Writes the subdirectory rules into `.htaccess` (Apache, and WP-CLI where the server is unknown); Nginx and IIS get the rules to add by hand.
6. Deletes itself. From then on the network behaves like vanilla WordPress.
7. Reports on the "Success!" page (or WP-CLI's output), with the lines to add by hand when a file could not be written.

Not done by the drop-in: subdomains (Windrose Helm's Set up screen switches while the network has one site), languages beyond the installer's, plugins, privacy choices.

## Building

```
bin/build-zip.sh [vX.Y.Z]          # dist/windrose-suite.zip and dist/windrose-suite.txt
CORE=7.2 bin/build-zip.sh          # a released WordPress version instead of the nightly
PLUGINS=local bin/build-zip.sh     # the working copies in ../windrose-<name> instead of their releases (tests)
```

The plugin repositories are public: no token is needed. `GH_TOKEN` (optional) only raises GitHub's limit for anonymous API calls.

## Checks

Locally (`composer install` brings PHPCS and PHPStan): `vendor/bin/phpcs`, `vendor/bin/phpstan analyse -c phpstan.neon.dist`, PHPUnit on a test database (`bin/install-wp-tests.sh <folder>`, then `WP_TESTS_DIR=<folder>/develop/tests/phpunit WP_TESTS_CONFIG_FILE_PATH=<folder>/wp-tests-config.php vendor/bin/phpunit`), and the WP-CLI install test `tests/install/cli-install.sh <zip> <folder> <url>` on an empty database.

The Playwright tests run against throwaway installations next to a web server with WP-CLI; `WINDROSE_E2E_HOST` sets the host (default `localhost`). The installation test (`tests/e2e/install.spec.mjs`) uses a throwaway installation (folder `shiplaunch-e2e/`, database `shiplaunch_e2e`, both deleted afterwards): French installer, then Set up keeping French for the main site and adding German (Switzerland), Italian and Esperanto, network media on, privacy on; then it checks the four sites, their languages, titles ("Windrose e2e - DE") and default content (each first post in its own language, in blocks), Multisite Language Switcher without flags, the plugins, the language group, the hreflang links and `lang` attribute of each home page, the missing emoji script, and that the Set up screen and core's installer are closed.

The plugins added to an existing site (`tests/e2e/existing-network.spec.mjs`, `existing-single.spec.mjs`, `existing-single-helm.spec.mjs`, on throwaway installations in `existing-e2e/`): an existing network (English, French linked by Multisite Language Switcher, a Social site with a classic theme), and a single site with older content converted with WordPress's own Network Setup. The plugins are uploaded and network-activated in Network Admin; nothing may change until the owner chooses; then a language group (and on the network, a shared image) works.

**On GitHub** (`.github/workflows/ci.yml`): `php -l` on PHP 8.4 and 8.5, PHPCS, PHPStan (PHP 8.4), `bash -n`, PHPUnit (single site) on the WordPress nightly with PHP 8.4 and 8.5, and the zip built from the latest releases and installed with WP-CLI (`tests/install/cli-install.sh`) on PHP 8.4 and 8.5.

## Releasing

1. Release the plugins first (the zip takes their latest releases).
2. Set the version in `wp-content/install.php` (the `Version:` line and `WINDROSE_SHIPLAUNCH_VERSION`), run the checks, commit, wait for the green CI run.
3. Tag `vX.Y.Z` and push the tag: `.github/workflows/release.yml` builds the zip (refusing a tag that does not match the version) and publishes it with the list of what is inside.

## Status

Download `windrose-suite.zip` from this repository's GitHub releases. A wordpress.org version may come later, after independent reviews.

## Security

Please report vulnerabilities privately, never in a public issue: see [SECURITY.md](SECURITY.md).

## Contributing

Reviews, tests and issues are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

## How this code is written

I write this distribution with Claude Code (Anthropic's AI coding assistant): I design each feature, test it on real sites and review every release. Commits written with Claude say so in a `Co-Authored-By` line. Human review is especially welcome.

## Licence

GPL-2.0-or-later.
