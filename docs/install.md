# Installing the Windrose Suite

The Windrose Suite is WordPress, unmodified, plus the Windrose plugins and an installer that turns the new site into a network of sites. You install it like WordPress, then finish on one screen: **Windrose Helm, Set up**.

## What you need

- A web host with **PHP 8.4 or newer** and MySQL 8 or MariaDB 10.6 or newer (as WordPress needs).
- **Apache** (the installer writes the rules) or **Nginx** (you or your host add the rules it shows).
- An address **without a port number**: `https://example.com/` or `https://example.com/site/`, not `https://example.com:8080/`. WordPress networks do not work with ports; on such an address the installer leaves a single site.
- An empty database, and its name, user and password.
- For subdomains (`fr.example.com` instead of `example.com/fr/`): a wildcard DNS record (`*`) pointing to the website, and an HTTPS certificate that covers the subdomains. Ask your host if unsure. Subdirectories need nothing more.

## 1. Upload and run the installer

1. Download `windrose-suite.zip` from the latest release: https://github.com/webpresencecare/windrose-shiplaunch/releases
2. Unzip it. Upload the **contents** of its `windrose` folder to your website's folder (where `wp-config.php` will be). Your host's file manager can usually unzip on the server.
3. Open your website's address in a browser. WordPress's own installer starts: choose the **language** (it becomes the network's language), then enter the database details if asked, then the site title, your username, password and email.
4. On the "Success!" page, a box says: **"The Windrose Suite turned this site into a network of sites (subdirectories)."** The installer has created the network, written the network settings into `wp-config.php` and the rules into `.htaccess`, activated Windrose Helm for the network and deleted itself (`wp-content/install.php`).

If the box shows lines to copy:

- **Lines for `wp-config.php`**: WordPress could not write the file. Open `wp-config.php` (file manager or FTP) and paste the lines above the line `/* That's all, stop editing! */`, then log in.
- **Rules for `.htaccess`** (Apache): replace the block between `# BEGIN WordPress` and `# END WordPress` in `.htaccess` with the rules shown.
- **Rules for Nginx**: add them to the site's server configuration, or give them to your host. Until then, the main site works but the other sites cannot be reached. The rules for an address at the root of the domain:

  ```
  if (!-e $request_filename) {
  	rewrite /wp-admin$ $scheme://$host$uri/ permanent;
  	rewrite ^/[_0-9a-zA-Z-]+(/wp-.*) $1 last;
  	rewrite ^/[_0-9a-zA-Z-]+(/.*\.php)$ $1 last;
  }
  ```

- **"Delete the file wp-content/install.php"**: WordPress could not delete it. Delete it yourself; it is only needed during the installation.

## 2. Log in: the Set up screen

Log in with the username and password you chose. You land on **Network Admin, Windrose Helm, Set up**. Until it is finished, a notice on every admin screen links back to it. Go through the five steps; nothing happens until the last one.

1. **Addresses.** Subdirectories (`example.com/fr/`, already set up) or subdomains (`fr.example.com`). Subdomains need a wildcard DNS record (`*`) pointing to your website and an HTTPS certificate covering the subdomains: set them up with your host first, then tick the box confirming it. The Set up screen can switch only while the network has one site, and only when WordPress can change `wp-config.php`; switching later is possible, but by hand (`wp-config.php`, the rewrite rules and the address of every site).
2. **Languages.** The language of the main site (also the default for new sites). Switch **Multilingual** on for one site per language: the main site's title is proposed with its language code ("My site - FR"), then add the other languages; each gets an address (for example `de`) and a title ("My site - DE"), proposed and changeable. The Set up screen then installs Multisite Language Switcher from wordpress.org, activates Windrose Sabir, creates one site per language and links the sites as translations of each other: a **language group**, with the main site as the source language. Each new site gets the title chosen above, and WordPress's first post, page and comment in its own language. The first post and the sample page of all the sites are linked as translations of each other (unless you already changed them on the main site). Only the main site has a privacy policy page: WordPress creates none for new sites of a network. The language switcher shows language names, without flags.
3. **Plugins.** **Network media** (Windrose Anchors): images and files of the main site can be shared with the other sites, each site with its own alternative text and caption; with the box ticked, every site may use them. **Recommended plugins**: tick the ones you want; network plugins are installed and activated for the network, per-site plugins are installed only (activate them on the sites that need them).
4. **Privacy.** **Use wordpress.org**: on, WordPress checks for updates and can install plugins, themes and languages; off, nothing is sent to wordpress.org and updates are manual (Windrose plugins still update from GitHub). The fourteen **privacy** switches are all on; each is explained on the screen.
5. **Review.** The list of what will happen, in order. **Set up the network** runs one task after the other and shows each result. If one fails (for example wordpress.org cannot be reached), read the message, then **Try again** or **Skip this one and go on**.

When the last task is done, the screen shows the new sites' addresses and closes for good: it is not shown again, and its routes refuse every request. Everything stays changeable in Network Admin: Sites, Plugins, Settings, and the Windrose screens.

## 3. After the set-up

- **The main site's posts are under `/blog/`** (for example `example.com/blog/2026/10/26/hello-world/`) on subdirectory networks: WordPress does this so that post addresses never clash with site addresses. Pages are not affected. To remove it: Network Admin, Sites, edit the main site, Settings tab, Permalink Structure. Subdomain networks have no `/blog/`.
- **New sites** get WordPress's default content: Network Admin, Settings, "New Site Settings" (First Post, First Page, First Comment) changes it. Sites created by the Set up screen have it in their own language. Sites added later through Sites, Add Site get it in the language of the administrator who adds them, and their first post's text in the installer's language, which WordPress stored for the whole network (WordPress's own behaviour): change "First Post" there, or edit the post. That stored first post is saved without blocks, so it opens as a Classic block in the editor; the Set up screen's sites get theirs in blocks.
- **Language switcher**: add the **Language item** block (Windrose Sabir) to the Navigation block in the header of each language site (Site Editor, Patterns, Header). Site Health on each site says whether the header has one.
- **Updates of Windrose plugins** come from their GitHub releases, like other plugin updates (Dashboard, Updates).
- **Multisite Language Switcher** comes from wordpress.org. Version 3.0.3 logs deprecation notices on PHP 8.4 and newer when debugging is on (harmless, fixed in 3.1.0). Windrose Sabir's Copy brings its own importers, so MSLS's own content import is not needed.

## Installing with WP-CLI

`wp core install` runs the same installer: on a server where the zip was unpacked and `wp-config.php` created (`wp config create`), it leaves a subdirectory network with Windrose Helm active and the Set up screen waiting:

```
wp config create --dbname=... --dbuser=... --dbpass=...
wp core install --url=https://example.com --title="My network" --admin_user=... --admin_email=...
```

The output says what the installer did, and shows any lines to add by hand.

## When something goes wrong

- **"WordPress networks cannot use port …"**: the site stayed a single site. Install on an address without a port, from an empty database.
- **The other sites answer "Not Found"**: the rewrite rules are missing (Nginx, or `.htaccess` not writable). Add the rules shown on the "Success!" page; Network Admin, Windrose Helm, Set up shows them again while the set-up is not finished.
- **Starting again**: empty the database (all tables), put `wp-content/install.php` back from the zip, and open the website again.
