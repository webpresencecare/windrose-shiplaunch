/**
 * The end-to-end installation test: unzip, run the installer (in French) and the Set up screen (French main site
 * kept, German (Switzerland), Italian and Esperanto added), land in a working four-language network with Privacy on.
 * Runs on a throwaway installation (folder web/shiplaunch-e2e/, database shiplaunch_e2e), never on a site in use.
 * WINDROSE_E2E_HOST: the host (default localhost).
 */
import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

const HOST = process.env.WINDROSE_E2E_HOST ?? 'localhost';
const BASE = `https://${ HOST }/shiplaunch-e2e/`;
const PATH = '/var/www/html/web/shiplaunch-e2e';
const USER = 'owner';
// The languages added in Set up: locale, name in the language list, address part Set up proposes, and the address
// and title kept (Esperanto's are typed in, to check the screen's own values are used).
const OTHERS = [
	{ locale: 'de_CH', option: /^Deutsch \(Schweiz\) \(German \(Switzerland\)\)$/, label: 'Deutsch (Schweiz)', path: 'de', hreflang: 'de', title: 'Windrose e2e - DE' },
	{ locale: 'it_IT', option: /^Italiano \(Italian\)$/, label: 'Italiano', path: 'it', hreflang: 'it', title: 'Windrose e2e - IT' },
	{ locale: 'eo', option: /^Esperanto$/, label: 'Esperanto', path: 'eo', hreflang: 'eo', title: 'Windrose e2e - EO', typed: { path: 'esperanto', title: 'Windrose en Esperanto' } },
];
// The throwaway installation is deleted after the run, so a fixed password is fine (also lets a run with --keep resume).
const PASS = 'Windrose-e2e-throwaway-7c41';

/** WP-CLI on the throwaway installation. */
function wp( url, ...args ) {
	return execFileSync( 'wp', [ ...args, `--path=${ PATH }`, `--url=${ url }` ], { encoding: 'utf8' } ).trim();
}

/** WP-CLI, '' when the command fails (for example an option that does not exist). */
function tryWp( url, ...args ) {
	try {
		return wp( url, ...args );
	} catch {
		return '';
	}
}

/** WCAG 2.2 AA checks (axe) on part of the page. */
async function expectAccessible( page, selector ) {
	await page.waitForFunction( () => document.getAnimations().every( ( animation ) => 'running' !== animation.playState ) );
	const results = await new AxeBuilder( { page } )
		.include( selector )
		.withTags( [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ] )
		.analyze();
	expect( results.violations.map( ( v ) => `${ v.id }: ${ v.nodes.map( ( n ) => n.target ).join( ', ' ) }` ) ).toEqual( [] );
}

/** Logs in on the throwaway installation (each test has a fresh browser context). */
async function login( page ) {
	await page.goto( `${ BASE }wp-login.php` );
	await page.locator( '#user_login' ).fill( USER );
	await page.locator( '#user_pass' ).fill( PASS );
	await page.locator( '#wp-submit' ).click();
	await page.waitForURL( /wp-admin/ );
}

// The throwaway installation has its own login: no saved session of another site.
test.use( { storageState: { cookies: [], origins: [] }, locale: 'fr-FR' } );
test.describe.configure( { mode: 'serial' } );

test( 'the installer turns the new site into a network and removes itself', async ( { page } ) => {
	await page.goto( `${ BASE }wp-admin/install.php` );
	await page.locator( '#language' ).selectOption( 'fr_FR' );
	await page.locator( '#language-continue' ).click();
	await expect( page.locator( 'h1' ) ).toHaveText( 'Bienvenue' );
	await page.locator( '#weblog_title' ).fill( 'Windrose e2e' );
	await page.locator( '#user_login' ).fill( USER );
	await page.locator( '#pass1' ).fill( PASS );
	await page.locator( '#admin_email' ).fill( 'owner@example.com' );
	await page.locator( '#submit' ).click();

	await expect( page.locator( 'h1' ) ).toHaveText( 'Quel succès !' );
	const report = page.locator( '.windrose-shiplaunch-report' );
	await expect( report ).toContainText( 'network of sites' );
	await expect( report.locator( 'textarea' ) ).toHaveCount( 0 );

	expect( wp( BASE, 'eval', 'echo is_multisite() ? "yes" : "no";' ) ).toBe( 'yes' );
	expect( wp( BASE, 'eval', 'echo file_exists( WP_CONTENT_DIR . "/install.php" ) ? "yes" : "no";' ) ).toBe( 'no' );
	expect( wp( BASE, 'network', 'meta', 'get', '1', 'WPLANG' ) ).toBe( 'fr_FR' );
	expect( JSON.parse( wp( BASE, 'network', 'meta', 'get', '1', 'site_admins', '--format=json' ) ) ).toEqual( [ USER ] );
	expect( wp( BASE, 'plugin', 'list', '--status=active-network', '--field=name' ) ).toBe( 'windrose-helm' );
} );

test( 'after logging in, the Set up screen opens; the steps set up French with German, Italian and Esperanto', async ( { page } ) => {
	await login( page );
	await expect( page ).toHaveURL( /wp-admin\/network\/admin\.php\?page=windrose-helm-setup$/ );
	await expect( page.locator( '.windrose-helm-setup h1' ) ).toBeVisible();
	const app = page.locator( '#windrose-helm-setup-app' );

	// 1. Addresses: subdirectories (kept).
	await expect( app.getByRole( 'radio' ).first() ).toBeChecked();
	await expectAccessible( page, '#windrose-helm-setup-app' );
	await app.getByRole( 'button', { name: /^(Next|Suivant)$/ } ).click();

	// 2. Languages: the installer's language (French) stays the main site's; multilingual with three more.
	await expect( app.getByLabel( 'Language of the main site' ) ).toHaveValue( 'fr_FR' );
	await app.getByLabel( 'Multilingual: one site per language' ).check();
	await expect( app.getByLabel( 'Title of the main site' ) ).toHaveValue( 'Windrose e2e - FR' );
	const add = app.getByLabel( 'Add a language' );
	for ( const other of OTHERS ) {
		await add.fill( other.label );
		await page.locator( 'li[role="option"]', { hasText: other.option } ).click();
		await expect( app.getByLabel( `Address of the ${ other.label } site` ) ).toHaveValue( other.path );
		await expect( app.getByLabel( `Title of the ${ other.label } site` ) ).toHaveValue( other.title );
		if ( other.typed ) {
			await app.getByLabel( `Address of the ${ other.label } site` ).fill( other.typed.path );
			await app.getByLabel( `Title of the ${ other.label } site` ).fill( other.typed.title );
		}
	}
	await expectAccessible( page, '#windrose-helm-setup-app' );
	await app.getByRole( 'button', { name: /^(Next|Suivant)$/ } ).click();

	// 3. Plugins: network media on, every site allowed; no recommended plugin.
	await expect( app.getByLabel( 'Network media (Windrose Anchors)' ) ).toBeChecked();
	await expect( app.getByLabel( /^Allow every site to use network media/ ) ).toBeChecked();
	await expectAccessible( page, '#windrose-helm-setup-app' );
	await app.getByRole( 'button', { name: /^(Next|Suivant)$/ } ).click();

	// 4. Privacy: everything on, wordpress.org on.
	const switches = app.locator( 'input[type="checkbox"]' );
	await expect( switches ).toHaveCount( 16 );
	const count = await switches.count();
	for ( let index = 0; index < count; index++ ) {
		await expect( switches.nth( index ) ).toBeChecked();
	}
	await expectAccessible( page, '#windrose-helm-setup-app' );
	await app.getByRole( 'button', { name: /^(Next|Suivant)$/ } ).click();

	// 5. Review, then run.
	await expect( app.locator( '.windrose-helm-setup__review li' ) ).not.toHaveCount( 0 );
	await expectAccessible( page, '#windrose-helm-setup-app' );
	await app.locator( '.windrose-helm-setup__buttons .is-primary' ).click();
	await expect( app.locator( '.windrose-helm-setup__progress .failed' ) ).toHaveCount( 0 );
	await expect( app.locator( '.windrose-helm-setup__sites a' ) ).toHaveCount( OTHERS.length, { timeout: 240000 } );
	await expect( app.locator( '.windrose-helm-setup__progress li.done' ) ).toHaveCount(
		await app.locator( '.windrose-helm-setup__progress li' ).count()
	);
	await expectAccessible( page, '#windrose-helm-setup-app' );
} );

test( 'the network works in four languages, with Privacy on, and the Set up screen is closed', async ( { page } ) => {
	const urls = OTHERS.map( ( other ) => `${ BASE }${ other.typed?.path ?? other.path }/` );
	// Sites, languages, plugins.
	const sites = JSON.parse( wp( BASE, 'site', 'list', '--fields=blog_id,url', '--format=json' ) );
	expect( sites.map( ( s ) => s.url ) ).toEqual( [ BASE, ...urls ] );
	expect( wp( BASE, 'option', 'get', 'WPLANG' ) ).toBe( 'fr_FR' );
	expect( wp( BASE, 'option', 'get', 'blogname' ) ).toBe( 'Windrose e2e - FR' );
	const active = wp( BASE, 'plugin', 'list', '--status=active-network', '--field=name' ).split( '\n' ).sort();
	expect( active ).toEqual( [ 'multisite-language-switcher', 'windrose-anchors', 'windrose-helm', 'windrose-sabir' ] );
	OTHERS.forEach( ( other, index ) => {
		expect( wp( urls[ index ], 'option', 'get', 'WPLANG' ) ).toBe( other.locale );
		// Core's default first post, written in the site's own language (its translation from the language pack).
		const expected = wp( urls[ index ], 'eval', `load_textdomain( 'default', WP_LANG_DIR . '/admin-${ other.locale }.mo', '${ other.locale }' ); echo __( 'Hello world!' );` );
		expect( expected ).not.toBe( 'Hello world!' );
		expect( wp( urls[ index ], 'post', 'list', '--post_type=post', '--field=post_title' ) ).toBe( expected );
		// Its text too (not the installer's French stored for the network), in blocks.
		const text = wp( urls[ index ], 'eval', `load_textdomain( 'default', WP_LANG_DIR . '/admin-${ other.locale }.mo', '${ other.locale }' ); echo __( 'Welcome to %s. This is your first post. Edit or delete it, then start writing!' );` );
		const content = wp( urls[ index ], 'post', 'get', '1', '--field=post_content' );
		expect( content.startsWith( '<!-- wp:paragraph -->' ) ).toBe( true );
		for ( const part of text.split( '%s' ) ) {
			expect( content ).toContain( part );
		}
		// Title: the proposed one ("<network name> - <code>"), or the one typed in.
		expect( wp( urls[ index ], 'option', 'get', 'blogname' ) ).toBe( other.typed?.title ?? other.title );
	} );
	// No flags: Multisite Language Switcher shows names in the switcher and labels in the admin, on every site.
	for ( const url of [ BASE, ...urls ] ) {
		const msls = JSON.parse( wp( url, 'option', 'get', 'msls', '--format=json' ) );
		expect( [ msls.display, msls.admin_display ] ).toEqual( [ 1, 'label' ] );
	}
	// WordPress's default content of the four sites, linked as translations (MSLS's links, written by Sabir): the first
	// post (ID 1) and the sample page (ID 2) on each site point to the same item on the three other sites.
	const locales = [ 'fr_FR', ...OTHERS.map( ( other ) => other.locale ) ];
	const siteUrls = [ BASE, ...urls ];
	for ( const id of [ 1, 2 ] ) {
		siteUrls.forEach( ( url, index ) => {
			const expected = Object.fromEntries( locales.filter( ( locale ) => locale !== locales[ index ] ).map( ( locale ) => [ locale, id ] ) );
			expect( JSON.parse( wp( url, 'option', 'get', `msls_${ id }`, '--format=json' ) ), `item ${ id } on ${ url }` ).toEqual( expected );
		} );
	}
	// WordPress creates a privacy policy page only for the main site (new network sites get one only when the network
	// option default_privacy_policy_content is set): nothing to link it to, so it stays unlinked.
	expect( wp( BASE, 'option', 'get', 'wp_page_for_privacy_policy' ) ).toBe( '3' );
	expect( tryWp( BASE, 'option', 'get', 'msls_3', '--format=json' ) ).toBe( '' );
	for ( const url of urls ) {
		expect( wp( url, 'option', 'get', 'wp_page_for_privacy_policy' ) ).toBe( '0' );
	}

	// One language group of the four sites, the French main site as its main site; network media allowed on the others.
	const groups = JSON.parse( wp( BASE, 'site', 'option', 'get', 'windrose_sabir_groups', '--format=json' ) );
	expect( groups ).toHaveLength( 1 );
	expect( groups[ 0 ].main ).toBe( 1 );
	const others = sites.slice( 1 ).map( ( s ) => Number( s.blog_id ) );
	expect( JSON.parse( wp( BASE, 'site', 'option', 'get', 'windrose_anchors_sites', '--format=json' ) ) ).toEqual( others );

	// Each home page: its language, hreflang links to the four home pages, no emoji script (Privacy on).
	for ( const [ index, url ] of [ BASE, ...urls ].entries() ) {
		await page.goto( url );
		const locale = 0 === index ? 'fr_FR' : OTHERS[ index - 1 ].locale;
		await expect( page.locator( 'html' ) ).toHaveAttribute( 'lang', locale.replace( '_', '-' ) );
		// Multisite Language Switcher writes the short language code while it is unique in the group.
		const alternates = await page.locator( 'link[rel="alternate"][hreflang]' ).evaluateAll( ( links ) =>
			links.map( ( link ) => `${ link.hreflang } ${ link.href }` ).sort()
		);
		expect( alternates ).toEqual( [ `fr ${ BASE }`, ...OTHERS.map( ( other, i ) => `${ other.hreflang } ${ urls[ i ] }` ) ].sort() );
		expect( await page.content() ).not.toContain( 'wp-emoji' );
	}

	// The Set up screen, its notice and routes are gone; the Windrose Helm screen is the menu's target again.
	await login( page );
	// The posts list shows translations with language labels, no flag images; the first post's translations are
	// links to edit them (MSLS's pencil), not to create them (its "+").
	await page.goto( `${ BASE }wp-admin/edit.php` );
	await expect( page.locator( '#the-list' ) ).toBeVisible();
	await expect( page.locator( 'img[src*="flags"]' ) ).toHaveCount( 0 );
	const row = page.locator( '#post-1' );
	for ( const other of OTHERS ) {
		const path = other.typed?.path ?? other.path;
		await expect( row.locator( `a[href*="/${ path }/wp-admin/post.php?post="]` ) ).toHaveCount( 1 );
		await expect( row.locator( `a[href*="/${ path }/wp-admin/post-new.php"]` ) ).toHaveCount( 0 );
	}
	// The French first post's page names its translations.
	await page.goto( wp( BASE, 'eval', 'echo get_permalink( 1 );' ) );
	const translations = await page.locator( 'link[rel="alternate"][hreflang]' ).evaluateAll( ( links ) => links.map( ( link ) => link.href ) );
	expect( translations ).toHaveLength( 4 );
	for ( const url of urls ) {
		expect( translations.some( ( href ) => href.startsWith( url ) && ! href.endsWith( `${ url }` ) ) ).toBe( true );
	}
	await expect( page ).not.toHaveURL( /windrose-helm-setup/ );
	expect( JSON.parse( wp( BASE, 'site', 'option', 'get', 'windrose_helm_setup', '--format=json' ) ).status ).toBe( 'done' );
	const gone = await page.goto( `${ BASE }wp-admin/network/admin.php?page=windrose-helm-setup` );
	expect( [ 403, 404 ] ).toContain( gone.status() );
	await expect( page.locator( '#windrose-helm-setup-app' ) ).toHaveCount( 0 );
	await page.goto( `${ BASE }wp-admin/network/` );
	await expect( page.locator( '#adminmenu' ) ).toBeVisible();
	await expect( page.locator( '.notice', { hasText: 'Set up the network' } ) ).toHaveCount( 0 );
	await expect( page.locator( '#adminmenu a[href$="page=windrose-helm"]' ).first() ).toBeVisible();
	await expect( page.locator( '#adminmenu a[href$="page=windrose-helm-setup"]' ) ).toHaveCount( 0 );
	// The routes answer 403 (asked through the Windrose Helm screen's own apiFetch, with its nonce).
	await page.goto( `${ BASE }wp-admin/network/admin.php?page=windrose-helm` );
	const closed = await page.evaluate( () =>
		window.wp.apiFetch( { path: '/windrose-helm/v1/setup' } ).then(
			() => ( { code: 'open' } ),
			( error ) => ( { code: error.code, status: error.data?.status } )
		)
	);
	expect( closed ).toEqual( { code: 'windrose_helm_setup_done', status: 403 } );
	// Core's installer refuses to run again.
	await page.goto( `${ BASE }wp-admin/install.php` );
	await expect( page.locator( 'h1' ) ).toHaveText( 'Déjà installé' );
} );
