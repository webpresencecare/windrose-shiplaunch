/**
 * An existing single site made a network by Windrose Helm (Tools, Make a network), without editing files by hand:
 * Helm uploaded and activated on the single site, Anchors and Sabir uploaded (not activated); the screen keeps the
 * post address structure with /blog in front; after logging in again, Set up adds a German site and links the
 * languages. Runs on a throwaway single site installation in existing-e2e/ (WINDROSE_E2E_HOST: the host, default
 * localhost).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

const BASE = `https://${ process.env.WINDROSE_E2E_HOST ?? 'localhost' }/existing-e2e/`;
const PATH = '/var/www/html/web/existing-e2e';
const ZIPS = '/var/www/html/tools/.existing-zips';
const PASS = 'Windrose-existing-throwaway-3e9';

function wp( url, ...args ) {
	return execFileSync( 'wp', [ ...args, `--path=${ PATH }`, `--url=${ url }` ], { encoding: 'utf8' } ).trim();
}

async function login( page ) {
	await page.context().clearCookies();
	await page.goto( `${ BASE }wp-login.php` );
	await page.locator( '#user_login' ).fill( 'owner' );
	await page.locator( '#user_pass' ).fill( PASS );
	await page.locator( '#wp-submit' ).click();
	await page.waitForURL( /wp-admin/ );
}

async function upload( page, slug, activate ) {
	await page.goto( `${ BASE }wp-admin/plugin-install.php?tab=upload` );
	await page.locator( '#pluginzip' ).setInputFiles( `${ ZIPS }/${ slug }.zip` );
	await page.locator( '#install-plugin-submit' ).click();
	await expect( page.getByRole( 'link', { name: 'Activate Plugin' } ) ).toBeVisible();
	if ( activate ) {
		await page.getByRole( 'link', { name: 'Activate Plugin' } ).click();
	}
}

async function expectAccessible( page, selector ) {
	const results = await new AxeBuilder( { page } ).include( selector ).withTags( [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ] ).analyze();
	expect( results.violations.map( ( v ) => `${ v.id }: ${ v.nodes.map( ( n ) => n.target ).join( ', ' ) }` ) ).toEqual( [] );
}

const state = {};

test.use( { storageState: { cookies: [], origins: [] }, locale: 'en-GB' } );
test.describe.configure( { mode: 'serial' } );

test( 'on the single site, Helm offers to make it a network', async ( { page } ) => {
	state.post = ( await page.goto( `${ BASE }welcome-to-our-site/` ) ).status();
	expect( state.post ).toBe( 200 );
	await login( page );
	await upload( page, 'windrose-helm', true );
	await upload( page, 'windrose-anchors', false );
	await upload( page, 'windrose-sabir', false );
	await page.goto( `${ BASE }wp-admin/` );
	await page.getByRole( 'link', { name: 'Make this site a network' } ).click();
	await expect( page ).toHaveURL( /tools\.php\?page=windrose-helm-network/ );
	await expect( page.locator( 'h1' ) ).toHaveText( 'Make this site a network' );
	// A site in a folder: subdomains impossible; subdirectories offered despite the older post.
	await expect( page.locator( 'input[name="type"][value="subdomain"]' ) ).toBeDisabled();
	await expect( page.locator( 'input[name="type"][value="subdirectory"]' ) ).toBeChecked();
	await expect( page.locator( 'input[name="addresses"][value="keep"]' ) ).toBeChecked();
	await expect( page.locator( 'label', { has: page.locator( 'input[name="addresses"][value="keep"]' ) } ) ).toHaveText( /Keep the current structure, with \/blog in front: \/blog\/%postname%\// );
	await expectAccessible( page, '.windrose-helm-network' );
	// Nothing happens without the backup confirmation.
	await page.getByRole( 'button', { name: 'Make this site a network' } ).click();
	await expect( page.locator( '.notice-error' ) ).toContainText( 'backup' );
	expect( wp( BASE, 'eval', 'echo is_multisite() ? "yes" : "no";' ) ).toBe( 'no' );
} );

test( 'one click makes the network, files written, plugins kept', async ( { page } ) => {
	await login( page );
	await page.goto( `${ BASE }wp-admin/tools.php?page=windrose-helm-network` );
	const before = { config: readFileSync( `${ PATH }/wp-config.php`, 'utf8' ), htaccess: readFileSync( `${ PATH }/.htaccess`, 'utf8' ) };
	await page.locator( 'input[name="backup"]' ).check();
	await page.getByRole( 'button', { name: 'Make this site a network' } ).click();
	await expect( page.locator( '.notice-success' ) ).toContainText( 'This site is now the main site of a network.' );
	await expect( page.locator( 'textarea' ) ).toHaveCount( 0 );
	// Copies of both files as they were, named on the screen, to delete once everything works.
	expect( readFileSync( `${ PATH }/wp-config.backup.php`, 'utf8' ) ).toBe( before.config );
	expect( readFileSync( `${ PATH }/.htaccess.backup`, 'utf8' ) ).toBe( before.htaccess );
	expect( readFileSync( `${ PATH }/wp-config.php`, 'utf8' ) ).not.toBe( before.config );
	await expect( page.locator( '.notice-info' ) ).toContainText( 'wp-config.backup.php, .htaccess.backup' );
	await expect( page.locator( '.notice-info' ) ).toContainText( 'delete them' );
	expect( existsSync( `${ PATH }/backup.htaccess` ) ).toBe( false );
	// Apache never serves the .htaccess copy.
	expect( ( await page.request.get( `${ BASE }.htaccess.backup` ) ).status() ).toBe( 403 );
	await expectAccessible( page, '.windrose-helm-network' );
	// PHP's opcode cache rechecks wp-config.php every 2 seconds.
	await page.waitForTimeout( 2500 );
	expect( wp( BASE, 'eval', 'echo is_multisite() ? "yes" : "no";' ) ).toBe( 'yes' );
	expect( wp( BASE, 'option', 'get', 'permalink_structure' ) ).toBe( '/blog/%postname%/' );
	expect( wp( BASE, 'plugin', 'list', '--status=active-network', '--field=name' ) ).toBe( 'windrose-helm' );
	expect( wp( BASE, 'super-admin', 'list' ) ).toBe( 'owner' );
	expect( JSON.parse( wp( BASE, 'site', 'option', 'get', 'windrose_helm_setup', '--format=json' ) ).status ).toBe( 'pending' );
	// A second attempt is refused (network tables exist): the screen is gone on a network anyway.
	await page.getByRole( 'link', { name: 'Log in again' } ).click();
	await expect( page.locator( '#user_login' ) ).toBeVisible();
} );

test( 'old addresses redirect to /blog/<post>/, pages keep theirs; Set up adds German', async ( { page } ) => {
	const post = await page.goto( `${ BASE }welcome-to-our-site/` );
	expect( post.status() ).toBe( 200 );
	expect( page.url() ).toBe( `${ BASE }blog/welcome-to-our-site/` );
	expect( ( await page.goto( `${ BASE }about/` ) ).status() ).toBe( 200 );
	expect( page.url() ).toBe( `${ BASE }about/` );

	await login( page );
	await expect( page ).toHaveURL( /wp-admin\/network\/admin\.php\?page=windrose-helm-setup$/ );
	const app = page.locator( '#windrose-helm-setup-app' );
	await app.getByRole( 'button', { name: 'Next' } ).click();
	await app.getByLabel( 'Multilingual: one site per language' ).check();
	await app.getByLabel( 'Add a language' ).fill( 'Deutsch' );
	await page.locator( 'li[role="option"]', { hasText: /^Deutsch \(German\)$/ } ).click();
	await expect( app.getByLabel( 'Address of the Deutsch site' ) ).toHaveValue( 'de' );
	for ( let step = 0; step < 3; step++ ) {
		await app.getByRole( 'button', { name: 'Next' } ).click();
	}
	await app.locator( '.windrose-helm-setup__buttons .is-primary' ).click();
	await expect( app.locator( '.windrose-helm-setup__sites a' ) ).toHaveCount( 1, { timeout: 180000 } );
	await expect( app.locator( '.windrose-helm-setup__progress .failed' ) ).toHaveCount( 0 );

	const de = `${ BASE }de/`;
	expect( wp( de, 'option', 'get', 'WPLANG' ) ).toBe( 'de_DE' );
	const active = wp( BASE, 'plugin', 'list', '--status=active-network', '--field=name' ).split( '\n' ).sort();
	expect( active ).toEqual( [ 'multisite-language-switcher', 'windrose-anchors', 'windrose-helm', 'windrose-sabir' ] );
	// The site's own post and page are not WordPress's untouched defaults; its "Hello world!" is, and is linked.
	expect( JSON.parse( wp( BASE, 'option', 'get', 'msls_1', '--format=json' ) ) ).toEqual( { de_DE: 1 } );
	await page.goto( `${ BASE }blog/welcome-to-our-site/` );
	await expect( page.locator( '.entry-content, .wp-block-post-content' ).first() ).toContainText( 'Our first article.' );
} );
