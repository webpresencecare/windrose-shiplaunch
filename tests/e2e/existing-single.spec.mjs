/**
 * An existing single site becomes a network with WordPress's own Network Setup, then gets the Windrose plugins
 * (docs/existing-networks.md): a site with a post and a page two months old, /%postname%/ permalinks, an image.
 * Checks the gotchas the documentation names (no subdirectories for a site with posts older than a month unless
 * ALLOW_SUBDIRECTORY_INSTALL; the main site's post addresses change, old ones redirect), that the plugins change
 * nothing until chosen, then a French site in a language group. Runs on a throwaway single
 * site installation in existing-e2e/ (WINDROSE_E2E_HOST: the host, default localhost).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const BASE = `https://${ process.env.WINDROSE_E2E_HOST ?? 'localhost' }/existing-e2e/`;
const PATH = '/var/www/html/web/existing-e2e';
const ZIPS = '/var/www/html/tools/.existing-zips';
const PASS = 'Windrose-existing-throwaway-3e9';

function wp( url, ...args ) {
	return execFileSync( 'wp', [ ...args, `--path=${ PATH }`, `--url=${ url }` ], { encoding: 'utf8' } ).trim();
}

function tryWp( url, ...args ) {
	try {
		return wp( url, ...args );
	} catch {
		return '';
	}
}

async function login( page ) {
	// A fresh login each time (wp-login.php sends people already logged in straight to the dashboard).
	await page.context().clearCookies();
	await page.goto( `${ BASE }wp-login.php` );
	await page.locator( '#user_login' ).fill( 'owner' );
	await page.locator( '#user_pass' ).fill( PASS );
	await page.locator( '#wp-submit' ).click();
	await page.waitForURL( /wp-admin/ );
}

async function content( page, url ) {
	const response = await page.goto( url );
	return {
		status: response.status(),
		url: page.url(),
		html: await page.locator( '.entry-content, .wp-block-post-content' ).first().innerHTML(),
	};
}

/** PHP's opcode cache rechecks changed files every 2 seconds (opcache.revalidate_freq): wait before the next request. */
async function afterConfigChange( page ) {
	await page.waitForTimeout( 2500 );
}

const state = {};

test.use( { storageState: { cookies: [], origins: [] }, locale: 'en-GB' } );
test.describe.configure( { mode: 'serial' } );

test( 'before: a single site with older content', async ( { page } ) => {
	expect( wp( BASE, 'eval', 'echo is_multisite() ? "yes" : "no";' ) ).toBe( 'no' );
	state.post = await content( page, `${ BASE }welcome-to-our-site/` );
	state.page = await content( page, `${ BASE }about/` );
	expect( [ state.post.status, state.page.status ] ).toEqual( [ 200, 200 ] );
	expect( state.post.html ).toContain( 'Our first article.' );
} );

test( 'WordPress’s Network Setup: its two rules, then the network', async ( { page } ) => {
	wp( BASE, 'config', 'set', 'WP_ALLOW_MULTISITE', 'true', '--raw' );
	const allowed = 'require_once ABSPATH . "wp-admin/includes/network.php"; echo wp_json_encode( array( allow_subdomain_install(), allow_subdirectory_install() ) );';
	// A published post older than a month: subdirectories are refused (a site at the root of its domain then gets
	// subdomains only). A site in a folder, like this one, cannot use subdomains: so here neither is allowed yet.
	expect( JSON.parse( wp( BASE, 'eval', allowed ) ) ).toEqual( [ false, false ] );
	await login( page );
	await page.goto( `${ BASE }wp-admin/network.php` );
	await expect( page.getByText( 'Because your installation is in a directory, the sites in your WordPress network must use sub-directories.' ) ).toBeVisible();
	const warning = page.getByText( /will need to use a modified permalink structure,\s+potentially breaking existing links/ );
	await expect( warning ).toBeVisible();
	// The documented way out: ALLOW_SUBDIRECTORY_INSTALL in wp-config.php. Core's warning then goes, although the
	// main site's permalinks still change (next test).
	wp( BASE, 'config', 'set', 'ALLOW_SUBDIRECTORY_INSTALL', 'true', '--raw' );
	expect( JSON.parse( wp( BASE, 'eval', allowed ) ) ).toEqual( [ false, true ] );
	await afterConfigChange( page );
	await page.goto( `${ BASE }wp-admin/network.php` );
	await expect( warning ).toHaveCount( 0 );
	await page.locator( '#submit' ).click();

	// Core shows the lines to add: done here as a person would, in wp-config.php and .htaccess.
	const config = await page.locator( '#network-wpconfig-rules' ).inputValue();
	const rules = await page.locator( '#network-htaccess-rules' ).inputValue();
	const file = `${ PATH }/wp-config.php`;
	const current = readFileSync( file, 'utf8' );
	const anchor = current.indexOf( "/* That's all, stop editing!" );
	expect( anchor ).toBeGreaterThan( 0 );
	writeFileSync( file, current.slice( 0, anchor ) + config + '\n\n' + current.slice( anchor ) );
	writeFileSync( `${ PATH }/.htaccess`, '# BEGIN WordPress\n' + rules + '\n# END WordPress\n' );
	await afterConfigChange( page );

	await login( page );
	expect( wp( BASE, 'eval', 'echo is_multisite() ? "yes" : "no";' ) ).toBe( 'yes' );
	expect( ( await page.goto( `${ BASE }wp-admin/network/` ) ).status() ).toBe( 200 );
} );

test( 'the main site’s post addresses change; old addresses redirect, pages keep theirs', async ( { page } ) => {
	expect( wp( BASE, 'option', 'get', 'permalink_structure' ) ).toBe( '/blog/%year%/%monthnum%/%day%/%postname%/' );
	const post = await content( page, `${ BASE }welcome-to-our-site/` );
	expect( post.status ).toBe( 200 );
	expect( post.url ).toMatch( /\/existing-e2e\/blog\/\d{4}\/\d{2}\/\d{2}\/welcome-to-our-site\/$/ );
	expect( post.html ).toBe( state.post.html );
	const about = await content( page, `${ BASE }about/` );
	expect( [ about.status, about.url, about.html ] ).toEqual( [ 200, `${ BASE }about/`, state.page.html ] );
	state.postUrl = post.url;
} );

test( 'the Windrose plugins change nothing until chosen; then a French site in a language group', async ( { page } ) => {
	await login( page );
	for ( const slug of [ 'windrose-helm', 'windrose-anchors' ] ) {
		await page.goto( `${ BASE }wp-admin/network/plugin-install.php?tab=upload` );
		await page.locator( '#pluginzip' ).setInputFiles( `${ ZIPS }/${ slug }.zip` );
		await page.locator( '#install-plugin-submit' ).click();
		await page.getByRole( 'link', { name: 'Network Activate' } ).click();
		await expect( page.locator( '#message, .notice-success' ).first() ).toBeVisible();
	}
	// No Set up screen; a block theme everywhere: the block-only defaults start on.
	await login( page );
	await expect( page ).not.toHaveURL( /windrose-helm-setup/ );
	expect( tryWp( BASE, 'site', 'option', 'get', 'windrose_helm_setup', '--format=json' ) ).toBe( '' );
	await page.goto( `${ BASE }wp-admin/network/admin.php?page=windrose-helm` );
	await expect( page.locator( '#windrose-helm-app' ) ).not.toContainText( 'Loading' );
	expect( JSON.parse( wp( BASE, 'site', 'option', 'get', 'windrose_helm_defaults', '--format=json' ) ) ).toEqual( { block_themes: true, classic_screens: true, classic_editor: true, classic_block: true } );
	expect( ( await content( page, state.postUrl ) ).html ).toBe( state.post.html );

	// Then: Multisite Language Switcher, Windrose Sabir, a French site, one language group.
	wp( BASE, 'plugin', 'install', 'multisite-language-switcher', '--activate-network', '--quiet' );
	await page.goto( `${ BASE }wp-admin/network/plugin-install.php?tab=upload` );
	await page.locator( '#pluginzip' ).setInputFiles( `${ ZIPS }/windrose-sabir.zip` );
	await page.locator( '#install-plugin-submit' ).click();
	await page.getByRole( 'link', { name: 'Network Activate' } ).click();
	await expect( page.locator( '#message, .notice-success' ).first() ).toBeVisible();
	wp( BASE, 'language', 'core', 'install', 'fr_FR', '--quiet' );
	const fr = Number( wp( BASE, 'site', 'create', '--slug=fr', '--title=Existing single - FR', '--porcelain' ) );
	wp( `${ BASE }fr/`, 'option', 'update', 'WPLANG', 'fr_FR' );
	wp( BASE, 'eval', `$r = Windrose\\Sabir\\Groups::save( 0, 'Languages', array( 1, ${ fr } ), 1 ); if ( is_wp_error( $r ) ) { WP_CLI::error( $r->get_error_message() ); }` );
	// Multisite Language Switcher's settings on each site (its settings page; MSLS lists only configured sites).
	wp( BASE, 'option', 'update', 'msls', '{"description":"English","output_current_blog":"1"}', '--format=json' );
	wp( `${ BASE }fr/`, 'option', 'update', 'msls', '{"description":"Français","output_current_blog":"1"}', '--format=json' );
	await page.goto( `${ BASE }fr/` );
	const alternates = await page.locator( 'link[rel="alternate"][hreflang]' ).evaluateAll( ( links ) =>
		links.map( ( link ) => `${ link.hreflang } ${ link.href }` ).sort()
	);
	expect( alternates ).toEqual( [ `en ${ BASE }`, `fr ${ BASE }fr/` ] );
	expect( ( await content( page, state.postUrl ) ).html ).toBe( state.post.html );
} );
