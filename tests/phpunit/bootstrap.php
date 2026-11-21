<?php
/**
 * PHPUnit bootstrap: the WordPress test library (single site: the drop-in runs before the network exists), with the
 * installer drop-in's functions loaded. The drop-in only hooks wp_install, which the tests never fire.
 *
 * Environment:
 * - WP_TESTS_DIR: the test library (tests/phpunit of wordpress-develop). Default: /var/www/html/tools/wp-tests/tests/phpunit.
 * - WP_TESTS_CONFIG_FILE_PATH: its wp-tests-config.php (optional; default next to the test library).
 *
 * @package Windrose\Shiplaunch
 */

$windrose_tests_dir = getenv( 'WP_TESTS_DIR' ) ? getenv( 'WP_TESTS_DIR' ) : '/var/www/html/tools/wp-tests/tests/phpunit';

if ( getenv( 'WP_TESTS_CONFIG_FILE_PATH' ) ) {
	define( 'WP_TESTS_CONFIG_FILE_PATH', getenv( 'WP_TESTS_CONFIG_FILE_PATH' ) );
}
foreach ( array( dirname( __DIR__, 2 ) . '/vendor/yoast/phpunit-polyfills', '/var/www/html/tools/vendor/yoast/phpunit-polyfills' ) as $windrose_polyfills ) {
	if ( is_dir( $windrose_polyfills ) ) {
		define( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH', $windrose_polyfills );
		break;
	}
}

require_once $windrose_tests_dir . '/includes/functions.php';
require $windrose_tests_dir . '/includes/bootstrap.php';
require_once dirname( __DIR__, 2 ) . '/wp-content/install.php';
