<?php
/**
 * The Windrose Suite installer drop-in (Windrose Shiplaunch): turns a new WordPress installation into a network.
 *
 * WordPress loads wp-content/install.php from wp-admin/includes/upgrade.php, which about ten admin files include, not
 * only the installer. So this file only defines functions and hooks core's `wp_install` action, which core fires once,
 * at the end of its own installation (the installer screens and `wp core install` alike). In that action the new site
 * becomes a subdirectory network: network tables and rows, the network language, Windrose Helm network-activated with
 * its Set up screen waiting, the multisite constants in wp-config.php and the rewrite rules in .htaccess, or the exact
 * lines to add by hand when a file cannot be written. Then this file deletes itself: from then on the network behaves
 * like vanilla WordPress (new sites get core's default content). It replaces no core function.
 *
 * Version: 0.1.0
 *
 * @package Windrose\Shiplaunch
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WINDROSE_SHIPLAUNCH_VERSION', '0.1.0' );

add_action( 'wp_install', 'windrose_shiplaunch_install' );

/**
 * Turns the site core has just installed into a subdirectory network, then reports and deletes this file.
 *
 * @param WP_User|mixed $user The administrator core created.
 * @return void
 */
function windrose_shiplaunch_install( $user ): void {
	if ( is_multisite() || ! $user instanceof WP_User ) {
		return;
	}
	$report = array(
		'problem' => '',
		'config'  => '',
		'rules'   => '',
		'server'  => windrose_shiplaunch_server(),
		'deleted' => false,
	);

	$home    = (string) get_option( 'home' );
	$problem = windrose_shiplaunch_address_problem( $home );
	if ( '' !== $problem ) {
		$report['problem'] = $problem;
		windrose_shiplaunch_report( $report );
		return;
	}
	$domain = strtolower( (string) wp_parse_url( $home, PHP_URL_HOST ) );
	$path   = trailingslashit( (string) ( wp_parse_url( $home, PHP_URL_PATH ) ?? '' ) );
	$path   = '/' . ltrim( $path, '/' );

	$created = windrose_shiplaunch_create_network( $user, $domain, $path );
	if ( is_wp_error( $created ) ) {
		$report['problem'] = $created->get_error_message();
		windrose_shiplaunch_report( $report );
		return;
	}

	$config_lines = windrose_shiplaunch_config_lines( $domain, $path );
	if ( ! windrose_shiplaunch_write_config( $config_lines ) ) {
		$report['config'] = $config_lines;
	}

	// Apache, and servers WordPress cannot tell (WP-CLI): .htaccess (harmless where it is not read). Nginx and IIS:
	// the rules to add to the server configuration.
	$rules = 'nginx' === $report['server'] ? windrose_shiplaunch_nginx_rules( $path ) : windrose_shiplaunch_htaccess_rules( $path );
	if ( in_array( $report['server'], array( 'nginx', 'iis' ), true ) || ! windrose_shiplaunch_write_htaccess( $rules ) ) {
		$report['rules'] = $rules;
	}

	windrose_shiplaunch_set_network_meta(
		'windrose_helm_setup',
		array(
			'status'  => 'pending',
			'source'  => 'windrose-shiplaunch',
			'version' => WINDROSE_SHIPLAUNCH_VERSION,
			'time'    => time(),
			'manual'  => array(
				'config' => $report['config'],
				'rules'  => $report['rules'],
				'server' => $report['server'],
			),
		)
	);

	$report['deleted'] = windrose_shiplaunch_remove_self();
	windrose_shiplaunch_report( $report );
}

/**
 * Why this address cannot hold a network, or '' when it can. WordPress networks need a host name without a port
 * other than 80 or 443 (core's Network Setup refuses the others too).
 *
 * @param string $url Home address of the new site.
 * @return string
 */
function windrose_shiplaunch_address_problem( string $url ): string {
	$parts = wp_parse_url( $url );
	$host  = is_array( $parts ) ? strtolower( (string) ( $parts['host'] ?? '' ) ) : '';
	$port  = is_array( $parts ) ? (int) ( $parts['port'] ?? 0 ) : 0;
	$path  = is_array( $parts ) ? (string) ( $parts['path'] ?? '/' ) : '';

	if ( '' === $host || ! preg_match( '/^[a-z0-9.-]+$/', $host ) ) {
		return __( 'This address has no host name a network can use, so the site stays a single site.', 'windrose-shiplaunch' );
	}
	if ( 0 !== $port && 80 !== $port && 443 !== $port ) {
		return sprintf(
			/* translators: %d: port number. */
			__( 'WordPress networks cannot use port %d in their address, so the site stays a single site. Install on an address without a port number to get a network.', 'windrose-shiplaunch' ),
			$port
		);
	}
	if ( ! preg_match( '#^[A-Za-z0-9._~/-]*$#', $path ) ) {
		return __( 'The path of this address has characters a network cannot use, so the site stays a single site.', 'windrose-shiplaunch' );
	}
	return '';
}

/**
 * Creates the network tables and rows, as core's Network Setup does, plus the network language and Windrose Helm.
 *
 * @param WP_User $user   The administrator, who becomes super admin.
 * @param string  $domain Network domain.
 * @param string  $path   Network path, with slashes at both ends.
 * @return true|WP_Error
 */
function windrose_shiplaunch_create_network( WP_User $user, string $domain, string $path ) {
	global $wpdb;

	// The multisite table names are empty on a single site; core's Network Setup sets them the same way.
	foreach ( $wpdb->tables( 'ms_global' ) as $table => $prefixed_table ) {
		$wpdb->$table = $prefixed_table;
	}
	install_network();
	$result = populate_network( 1, $domain, $user->user_email, (string) get_option( 'blogname' ), $path, false );
	if ( is_wp_error( $result ) ) {
		return $result;
	}

	// The language chosen in the installer. The site is not a network yet in this request, so network options are
	// written to the network meta table directly (update_site_option() would write a site option).
	$locale = (string) get_option( 'WPLANG', '' );
	windrose_shiplaunch_set_network_meta( 'WPLANG', $locale );

	$helm = 'windrose-helm/windrose-helm.php';
	if ( file_exists( WP_PLUGIN_DIR . '/' . $helm ) ) {
		windrose_shiplaunch_set_network_meta( 'active_sitewide_plugins', array( $helm => time() ) );
	}
	return true;
}

/**
 * Writes one network option of network 1 to the network meta table.
 *
 * @param string $key   Option name.
 * @param mixed  $value Value (serialized when needed).
 * @return void
 */
function windrose_shiplaunch_set_network_meta( string $key, $value ): void {
	global $wpdb;
	$stored = maybe_serialize( $value );
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Installation request: no cache exists yet.
	$exists = $wpdb->get_var( $wpdb->prepare( "SELECT meta_id FROM {$wpdb->sitemeta} WHERE site_id = 1 AND meta_key = %s", $key ) );
	if ( null !== $exists ) {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- Same; one row by ID.
		$wpdb->update( $wpdb->sitemeta, array( 'meta_value' => $stored ), array( 'meta_id' => (int) $exists ) );
		return;
	}
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Same.
	$wpdb->insert(
		$wpdb->sitemeta,
		array(
			'site_id'    => 1,
			'meta_key'   => $key, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- Insert, not a query.
			'meta_value' => $stored, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- Insert, not a query.
		)
	);
}

/**
 * The web server, as far as WordPress can tell: apache, nginx, iis or other (WP-CLI, unknown servers).
 * Core sets these globals from SERVER_SOFTWARE (wp-includes/vars.php).
 *
 * @return string
 */
function windrose_shiplaunch_server(): string {
	global $is_apache, $is_nginx, $is_IIS, $is_iis7; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.VariableNotSnakeCase -- Core's globals.
	if ( ! empty( $is_nginx ) ) {
		return 'nginx';
	}
	if ( ! empty( $is_IIS ) || ! empty( $is_iis7 ) ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.VariableNotSnakeCase -- Core's globals.
		return 'iis';
	}
	if ( ! empty( $is_apache ) ) {
		return 'apache';
	}
	return 'other';
}

/**
 * The six multisite constants for wp-config.php, as core's Network Setup writes them.
 *
 * @param string $domain Network domain.
 * @param string $path   Network path.
 * @return string
 */
function windrose_shiplaunch_config_lines( string $domain, string $path ): string {
	return implode(
		"\n",
		array(
			'/* WordPress network (multisite), added by the Windrose Suite installer. */',
			"define( 'MULTISITE', true );",
			"define( 'SUBDOMAIN_INSTALL', false );",
			'define( \'DOMAIN_CURRENT_SITE\', ' . var_export( $domain, true ) . ' );', // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_var_export -- Writes a PHP string literal.
			'define( \'PATH_CURRENT_SITE\', ' . var_export( $path, true ) . ' );', // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_var_export -- Same.
			"define( 'SITE_ID_CURRENT_SITE', 1 );",
			"define( 'BLOG_ID_CURRENT_SITE', 1 );",
		)
	) . "\n";
}

/**
 * Adds the constants to the contents of wp-config.php, before the "stop editing" line (or before wp-settings.php is
 * loaded when that line is missing).
 *
 * @param string $contents Current contents.
 * @param string $lines    The lines to add.
 * @return string|null New contents, or null when there is no place for them or a network constant is already there.
 */
function windrose_shiplaunch_add_config( string $contents, string $lines ): ?string {
	if ( preg_match( "/define\\(\\s*['\"](MULTISITE|SUBDOMAIN_INSTALL|DOMAIN_CURRENT_SITE|WP_ALLOW_MULTISITE)['\"]/", $contents ) ) {
		return null;
	}
	$anchors = array(
		"/^\\/\\*\\s*That's all, stop editing!.*$/m",
		'/^\\/\\*\\*\\s*Absolute path to the WordPress directory\\..*$/m',
		"/^\\s*require_once\\s*\\(?\\s*ABSPATH\\s*\\.\\s*['\"]wp-settings\\.php['\"].*$/m",
	);
	foreach ( $anchors as $anchor ) {
		if ( preg_match( $anchor, $contents, $found, PREG_OFFSET_CAPTURE ) ) {
			$at = (int) $found[0][1];
			return substr( $contents, 0, $at ) . $lines . "\n" . substr( $contents, $at );
		}
	}
	return null;
}

/**
 * Where wp-config.php is: next to WordPress, or one folder above (as core allows).
 *
 * @return string
 */
function windrose_shiplaunch_config_path(): string {
	if ( ! file_exists( ABSPATH . 'wp-config.php' ) && file_exists( dirname( ABSPATH ) . '/wp-config.php' ) && ! file_exists( dirname( ABSPATH ) . '/wp-settings.php' ) ) {
		return dirname( ABSPATH ) . '/wp-config.php';
	}
	return ABSPATH . 'wp-config.php';
}

/**
 * Writes the constants into wp-config.php when PHP may change it.
 *
 * @param string $lines The lines to add.
 * @return bool Whether they were written.
 */
function windrose_shiplaunch_write_config( string $lines ): bool {
	$file = windrose_shiplaunch_config_path();
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_is_writable -- Installation request, before any filesystem credentials exist.
	if ( ! is_file( $file ) || ! is_writable( $file ) ) {
		return false;
	}
	$contents = file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local file.
	if ( false === $contents ) {
		return false;
	}
	$changed = windrose_shiplaunch_add_config( $contents, $lines );
	if ( null === $changed ) {
		return false;
	}
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- Same as core's own wp-config.php writes during setup.
	return false !== file_put_contents( $file, $changed, LOCK_EX );
}

/**
 * Apache rules for a subdirectory network, as core's Network Setup gives them (without the old ms-files rules).
 *
 * @param string $base Network path, with slashes at both ends.
 * @return string
 */
function windrose_shiplaunch_htaccess_rules( string $base ): string {
	$match = '([_0-9a-zA-Z-]+/)?';
	return implode(
		"\n",
		array(
			'RewriteEngine On',
			'RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]',
			'RewriteBase ' . $base,
			'RewriteRule ^index\.php$ - [L]',
			'',
			'# add a trailing slash to /wp-admin',
			'RewriteRule ^' . $match . 'wp-admin$ $1wp-admin/ [R=301,L]',
			'',
			'RewriteCond %{REQUEST_FILENAME} -f [OR]',
			'RewriteCond %{REQUEST_FILENAME} -d',
			'RewriteRule ^ - [L]',
			'RewriteRule ^' . $match . '(wp-(content|admin|includes).*) $2 [L]',
			'RewriteRule ^' . $match . '(.*\.php)$ $2 [L]',
			'RewriteRule . index.php [L]',
		)
	);
}

/**
 * Nginx rules for a subdirectory network (WordPress's Nginx documentation), for the server configuration.
 *
 * @param string $base Network path, with slashes at both ends.
 * @return string
 */
function windrose_shiplaunch_nginx_rules( string $base ): string {
	return implode(
		"\n",
		array(
			'location ' . $base . ' {',
			"\ttry_files \$uri \$uri/ " . $base . 'index.php?$args;',
			'}',
			'if (!-e $request_filename) {',
			"\trewrite " . rtrim( $base, '/' ) . '/wp-admin$ $scheme://$host$uri/ permanent;',
			"\trewrite ^" . $base . '[_0-9a-zA-Z-]+(/wp-.*) ' . rtrim( $base, '/' ) . '$1 last;',
			"\trewrite ^" . $base . '[_0-9a-zA-Z-]+(/.*\.php)$ ' . rtrim( $base, '/' ) . '$1 last;',
			'}',
		)
	);
}

/**
 * Replaces WordPress's block of .htaccess (core wrote single-site rules a moment ago) with the network rules.
 *
 * @param string $rules The rules.
 * @return bool Whether they were written.
 */
function windrose_shiplaunch_write_htaccess( string $rules ): bool {
	$file = get_home_path() . '.htaccess';
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_is_writable -- Same as core's save_mod_rewrite_rules().
	if ( ( file_exists( $file ) && ! is_writable( $file ) ) || ( ! file_exists( $file ) && ! is_writable( dirname( $file ) ) ) ) {
		return false;
	}
	return insert_with_markers( $file, 'WordPress', explode( "\n", $rules ) );
}

/**
 * Deletes this file, so the network behaves like vanilla WordPress from now on.
 *
 * @return bool Whether it is gone.
 */
function windrose_shiplaunch_remove_self(): bool {
	$file = WP_CONTENT_DIR . '/install.php';
	if ( ! file_exists( $file ) || realpath( $file ) !== realpath( __FILE__ ) ) {
		return false;
	}
	wp_delete_file( $file );
	clearstatcache( true, $file );
	return ! file_exists( $file );
}

/**
 * Says what happened: on the installer's success page, or in WP-CLI's output.
 *
 * @param array{problem: string, config: string, rules: string, server: string, deleted: bool} $report What happened.
 * @return void
 */
function windrose_shiplaunch_report( array $report ): void {
	$items = array();
	// Each: a message, and the lines to copy that go with it ('' for none).
	if ( '' !== $report['problem'] ) {
		$items[] = array( $report['problem'], '' );
	} else {
		$items[] = array( __( 'The Windrose Suite turned this site into a network of sites (subdirectories). After logging in, Windrose Helm’s Set up screen in Network Admin offers the next steps: languages, plugins, privacy.', 'windrose-shiplaunch' ), '' );
		if ( '' !== $report['config'] ) {
			$items[] = array(
				sprintf(
					/* translators: 1: wp-config.php, 2: the "stop editing" comment. */
					__( 'WordPress could not change %1$s. Add these lines to it, above the line %2$s, before logging in:', 'windrose-shiplaunch' ),
					'wp-config.php',
					'/* That’s all, stop editing! */'
				),
				$report['config'],
			);
		}
		if ( '' !== $report['rules'] ) {
			$items[] = array(
				match ( $report['server'] ) {
					'nginx' => __( 'This server runs Nginx: add these rules to the site’s server configuration (or ask your host to):', 'windrose-shiplaunch' ),
					'iis'   => __( 'This server runs IIS: use the rules of WordPress’s Network Setup screen for web.config. The Apache rules, for reference:', 'windrose-shiplaunch' ),
					default => sprintf(
						/* translators: %s: .htaccess */
						__( 'WordPress could not write the network rules into %s. Replace WordPress’s rules there with these (Apache), or give them to your host:', 'windrose-shiplaunch' ),
						'.htaccess'
					),
				},
				$report['rules'],
			);
		}
		if ( ! $report['deleted'] ) {
			$items[] = array(
				sprintf(
					/* translators: %s: wp-content/install.php */
					__( 'Delete the file %s: it was only needed for the installation.', 'windrose-shiplaunch' ),
					'wp-content/install.php'
				),
				'',
			);
		}
	}//end if

	if ( defined( 'WP_CLI' ) && WP_CLI && class_exists( 'WP_CLI' ) ) {
		foreach ( $items as list( $message, $lines ) ) {
			WP_CLI::log( 'Windrose: ' . $message );
			if ( '' !== $lines ) {
				WP_CLI::log( $lines );
			}
		}
		return;
	}

	echo '<div class="windrose-shiplaunch-report" role="status" style="border-inline-start:4px solid #3858e9;padding:0 1em;margin:0 0 1.5em;background:#f6f7f7;">';
	foreach ( $items as $index => list( $message, $lines ) ) {
		printf( '<p id="windrose-shiplaunch-%1$d">%2$s</p>', (int) $index, esc_html( $message ) );
		if ( '' !== $lines ) {
			printf( '<textarea class="code" readonly rows="9" style="width:100%%" aria-labelledby="windrose-shiplaunch-%1$d">%2$s</textarea>', (int) $index, esc_textarea( $lines ) );
		}
	}
	echo '</div>';
}
