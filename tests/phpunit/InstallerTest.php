<?php
/**
 * The installer drop-in's helpers. The whole installation (HTTP and WP-CLI) is tested end to end by
 * tests/e2e/install.spec.mjs and tests/install/cli-install.sh.
 *
 * @package Windrose\Shiplaunch
 */

/**
 * Drop-in helpers.
 */
class InstallerTest extends WP_UnitTestCase {

	public function test_it_hooks_wp_install_only(): void {
		$this->assertSame( 10, has_action( 'wp_install', 'windrose_shiplaunch_install' ) );
		$this->assertSame( '0.1.0', WINDROSE_SHIPLAUNCH_VERSION );
	}

	public function test_addresses_with_a_port_or_without_a_host_stay_single_sites(): void {
		$this->assertSame( '', windrose_shiplaunch_address_problem( 'https://example.com' ) );
		$this->assertSame( '', windrose_shiplaunch_address_problem( 'https://example.com:443/wp' ) );
		$this->assertSame( '', windrose_shiplaunch_address_problem( 'http://localhost/' ) );
		$this->assertStringContainsString( '8080', windrose_shiplaunch_address_problem( 'http://example.com:8080/' ) );
		$this->assertNotSame( '', windrose_shiplaunch_address_problem( 'not an address' ) );
		$this->assertNotSame( '', windrose_shiplaunch_address_problem( 'https://exa_mple.com/' ) );
		$this->assertNotSame( '', windrose_shiplaunch_address_problem( "https://example.com/it's/" ) );
	}

	public function test_config_lines_are_the_six_network_constants(): void {
		$lines = windrose_shiplaunch_config_lines( 'example.com', '/blog/' );
		foreach ( array( "'MULTISITE', true", "'SUBDOMAIN_INSTALL', false", "'DOMAIN_CURRENT_SITE', 'example.com'", "'PATH_CURRENT_SITE', '/blog/'", "'SITE_ID_CURRENT_SITE', 1", "'BLOG_ID_CURRENT_SITE', 1" ) as $line ) {
			$this->assertStringContainsString( 'define( ' . $line . ' );', $lines );
		}
		// The line Windrose Helm's Set up screen changes for subdomains, exactly once.
		$this->assertSame( 1, preg_match_all( "/^define\\(\\s*'SUBDOMAIN_INSTALL',\\s*false\\s*\\);\\s*$/m", $lines ) );
	}

	public function test_config_lines_go_above_the_stop_editing_line(): void {
		$sample   = (string) file_get_contents( ABSPATH . 'wp-config-sample.php' );
		$lines    = windrose_shiplaunch_config_lines( 'example.com', '/' );
		$contents = windrose_shiplaunch_add_config( $sample, $lines );
		$this->assertIsString( $contents );
		$this->assertLessThan( strpos( $contents, "/* That's all, stop editing!" ), strpos( $contents, "define( 'MULTISITE', true );" ) );
		$this->assertSame( strlen( $sample ) + strlen( $lines ) + 1, strlen( $contents ) );
		// The result is valid PHP.
		$file = get_temp_dir() . 'windrose-shiplaunch-config-' . wp_generate_password( 8, false ) . '.php';
		file_put_contents( $file, $contents );
		exec( 'php -l ' . escapeshellarg( $file ) . ' 2>&1', $output, $code );
		unlink( $file );
		$this->assertSame( 0, $code, implode( "\n", $output ) );
	}

	public function test_config_lines_go_above_wp_settings_without_the_stop_editing_line(): void {
		$contents = "<?php\ndefine( 'DB_NAME', 'x' );\nrequire_once ABSPATH . 'wp-settings.php';\n";
		$changed  = windrose_shiplaunch_add_config( $contents, "define( 'MULTISITE', true );\n" );
		$this->assertSame( "<?php\ndefine( 'DB_NAME', 'x' );\ndefine( 'MULTISITE', true );\n\nrequire_once ABSPATH . 'wp-settings.php';\n", $changed );
	}

	public function test_config_is_left_alone_when_network_constants_exist_or_there_is_no_place(): void {
		$lines = windrose_shiplaunch_config_lines( 'example.com', '/' );
		$this->assertNull( windrose_shiplaunch_add_config( "<?php\ndefine( 'WP_ALLOW_MULTISITE', true );\n/* That's all, stop editing! */\n", $lines ) );
		$this->assertNull( windrose_shiplaunch_add_config( "<?php\ndefine(\"MULTISITE\", true);\nrequire_once ABSPATH . 'wp-settings.php';\n", $lines ) );
		$this->assertNull( windrose_shiplaunch_add_config( "<?php\n// nothing to anchor to\n", $lines ) );
	}

	public function test_htaccess_rules_match_core_network_setup(): void {
		$rules = windrose_shiplaunch_htaccess_rules( '/wp/' );
		$this->assertStringContainsString( 'RewriteBase /wp/', $rules );
		$this->assertStringContainsString( 'RewriteRule ^([_0-9a-zA-Z-]+/)?wp-admin$ $1wp-admin/ [R=301,L]', $rules );
		$this->assertStringContainsString( 'RewriteRule ^([_0-9a-zA-Z-]+/)?(wp-(content|admin|includes).*) $2 [L]', $rules );
		$this->assertStringContainsString( 'RewriteRule ^([_0-9a-zA-Z-]+/)?(.*\.php)$ $2 [L]', $rules );
		$this->assertStringEndsWith( 'RewriteRule . index.php [L]', $rules );
		// Same lines as core's Network Setup screen gives (wp-admin/includes/network.php), apart from the old
		// ms-files rule for networks created before WordPress 3.5.
		$core = (string) file_get_contents( ABSPATH . 'wp-admin/includes/network.php' );
		foreach ( array( 'RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]', 'RewriteRule ^index\.php$ - [L]', 'RewriteCond %{REQUEST_FILENAME} -f [OR]', 'RewriteCond %{REQUEST_FILENAME} -d', 'RewriteRule ^ - [L]', 'RewriteRule . index.php [L]' ) as $line ) {
			$this->assertStringContainsString( $line, $core );
			$this->assertStringContainsString( $line, $rules );
		}
	}

	public function test_nginx_rules_follow_the_network_path(): void {
		$root = windrose_shiplaunch_nginx_rules( '/' );
		$this->assertStringContainsString( 'rewrite ^/[_0-9a-zA-Z-]+(/wp-.*) $1 last;', $root );
		$this->assertStringContainsString( 'rewrite /wp-admin$ $scheme://$host$uri/ permanent;', $root );
		$this->assertStringContainsString( 'try_files $uri $uri/ /index.php?$args;', $root );
		$sub = windrose_shiplaunch_nginx_rules( '/wp/' );
		$this->assertStringContainsString( 'rewrite ^/wp/[_0-9a-zA-Z-]+(/wp-.*) /wp$1 last;', $sub );
		$this->assertStringContainsString( 'try_files $uri $uri/ /wp/index.php?$args;', $sub );
	}

	public function test_network_meta_is_written_and_updated_directly(): void {
		global $wpdb;
		// The single-site test install has no network tables: use a temporary one under the same name.
		$table          = $wpdb->sitemeta;
		$wpdb->sitemeta = $wpdb->prefix . 'windrose_test_sitemeta';
		$wpdb->query( "CREATE TEMPORARY TABLE {$wpdb->sitemeta} ( meta_id bigint unsigned NOT NULL auto_increment, site_id bigint unsigned NOT NULL default 0, meta_key varchar(255), meta_value longtext, PRIMARY KEY (meta_id) )" );
		windrose_shiplaunch_set_network_meta( 'windrose_helm_setup', array( 'status' => 'pending' ) );
		windrose_shiplaunch_set_network_meta( 'WPLANG', 'fr_FR' );
		windrose_shiplaunch_set_network_meta( 'WPLANG', 'de_DE' );
		$rows = $wpdb->get_results( "SELECT site_id, meta_key, meta_value FROM {$wpdb->sitemeta} ORDER BY meta_id", ARRAY_A );
		$wpdb->query( "DROP TEMPORARY TABLE {$wpdb->sitemeta}" );
		$wpdb->sitemeta = $table;
		$this->assertSame(
			array(
				array(
					'site_id'    => '1',
					'meta_key'   => 'windrose_helm_setup',
					'meta_value' => serialize( array( 'status' => 'pending' ) ),
				),
				array(
					'site_id'    => '1',
					'meta_key'   => 'WPLANG',
					'meta_value' => 'de_DE',
				),
			),
			$rows
		);
	}

	public function test_it_does_nothing_on_a_network_or_without_a_user(): void {
		$before = get_option( 'permalink_structure' );
		windrose_shiplaunch_install( null );
		$this->assertSame( $before, get_option( 'permalink_structure' ) );
	}

	public function test_it_only_deletes_itself(): void {
		// WP_CONTENT_DIR/install.php is not this file in the tests: nothing is deleted.
		$this->assertFalse( windrose_shiplaunch_remove_self() );
		$this->assertFileExists( dirname( __DIR__, 2 ) . '/wp-content/install.php' );
	}

	public function test_the_report_escapes_and_shows_the_lines_to_copy(): void {
		ob_start();
		windrose_shiplaunch_report(
			array(
				'problem' => '',
				'config'  => "define( 'MULTISITE', true ); <script>",
				'rules'   => 'RewriteEngine On',
				'server'  => 'apache',
				'deleted' => false,
			)
		);
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'role="status"', $html );
		$this->assertSame( 2, substr_count( $html, '<textarea' ) );
		$this->assertStringContainsString( '&lt;script&gt;', $html );
		$this->assertStringNotContainsString( '<script>', $html );
		$this->assertStringContainsString( 'aria-labelledby="windrose-shiplaunch-1"', $html );
		$this->assertStringContainsString( 'wp-content/install.php', $html );
	}
}
