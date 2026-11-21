# The Windrose plugins on an existing network

The zip and its installer are for new installations. On a network that already exists, install the plugins you want: each one works alone (only Windrose Sabir needs Multisite Language Switcher). There is no Set up screen on such networks.

## Install

1. Download each plugin's zip from its latest GitHub release (`windrose-helm.zip`, `windrose-anchors.zip`, `windrose-sabir.zip`).
2. Network Admin, Plugins, Add Plugin, Upload Plugin; then **Network Activate**.
3. Updates come from each plugin's GitHub releases, like other plugin updates (Dashboard, Updates).

## What changes on activation

- **Windrose Helm**: defaults that would change existing sites start switched off and only report through Site Health (a classic theme or the Classic Editor in use). The privacy switches are on; the wordpress.org switch is on (nothing changes for updates). Check the Privacy tab: for example "Usernames hidden from visitors in the REST API" changes what the public REST API shows.
- **Windrose Anchors**: nothing changes until sites are allowed (Network Admin, Windrose Anchors, Sites) and items are shared from the main site.
- **Windrose Sabir**: Multisite Language Switcher's links stay as they are (in MSLS's own options), and MSLS works as before until a language group is saved. Before that, MSLS offers every site that has its settings as a translation: on the test network, a "Social" site in English appeared as a second English version of the French post (`hreflang="en-US"` twice). Once English and French form a group, only they link to each other (`hreflang="en"` and `"fr"`), and Social drops out. Before saving a group, the screen lists the translation links that would change.

Tested (`tests/e2e/existing-network.spec.mjs`): on a network with an English main site, a French site linked by MSLS (from wordpress.org) and a Social site with a classic theme, the three plugins uploaded and network-activated in Network Admin change no page, link or media item; there is no Set up screen; the block-only defaults start off and Site Health reports the classic theme; then a language group and a shared image work.

## A single site that should become a network

**With Windrose Helm** (recommended): upload Windrose Helm (and Windrose Anchors and Windrose Sabir if you want them: upload them without activating) in Plugins, Add Plugin, Upload Plugin, and activate Helm. A notice offers **Make this site a network** (Tools, Make a network):

- Subdirectories are always offered; subdomains only where WordPress allows them (not for a site in a folder), with a wildcard DNS record.
- The main site's post addresses: **keep the current structure with /blog in front** (for example `/%postname%/` becomes `/blog/%postname%/`; the old addresses redirect to the new ones), or WordPress's default `/blog/%year%/%monthnum%/%day%/%postname%/`. Pages keep their addresses.
- Confirm you have a backup, then one click: WordPress's network tables, `wp-config.php` and `.htaccess` (or the lines to add, when WordPress may not write them). Helm also saves copies of the two files as they were, `wp-config.backup.php` and `.htaccess.backup`, next to them: once the site, logging in and Network Admin work, delete both (the copy of `wp-config.php` holds the database password). Log in again: the Set up screen offers languages (Windrose Sabir must be uploaded first for those), plugins and privacy, as after a new installation.

Tested (`tests/e2e/existing-single-helm.spec.mjs`): a site in a folder with a post two months old, `/%postname%/`; the network made in one click, the old post address redirected to `/blog/<post>/`, the page unchanged, then a German site linked by Set up.

**By hand**, WordPress converts it: Tools, Network Setup (after adding `define( 'WP_ALLOW_MULTISITE', true );` to `wp-config.php`), then the lines it shows go into `wp-config.php` and `.htaccess`, then log in again. Things to know (tested, `tests/e2e/existing-single.spec.mjs`):

- **Subdirectories or subdomains.** A site installed in a folder (`example.com/site/`) can only use subdirectories. A site at the root of its domain that has a published post older than a month gets **subdomains only**, unless `define( 'ALLOW_SUBDIRECTORY_INSTALL', true );` is in `wp-config.php` before running Network Setup.
- **The main site's post addresses change.** With subdirectories, WordPress sets the main site's permalinks to `/blog/%year%/%monthnum%/%day%/%postname%/`, whatever they were (`/%postname%/` here). Old post addresses still work: WordPress redirects them to the new ones. Pages keep their addresses. To get the old structure back: Network Admin, Sites, edit the main site, Settings, Permalink Structure (choose a structure that cannot clash with site names). Core shows its warning about this only while subdirectories are not allowed; with `ALLOW_SUBDIRECTORY_INSTALL` the change still happens, without warning.
- After the conversion, the Windrose plugins behave as on any existing network: no Set up screen; with block themes, the block-only defaults start on.

The Windrose Suite has no conversion helper.

## Leaving

- **Windrose Anchors, Leave safely** gives each site its own copies of the network items it uses and points its content to them, so the main site's files can go. It changes the content directly in the database: no new revisions are made and the "modified" dates stay as they were.
- Deactivating Windrose Sabir leaves Multisite Language Switcher's links in place; MSLS then shows every site with a language again.
- Each plugin's uninstall says what it removes; data that keeps sites working (shared media, translation links) is never removed silently.
