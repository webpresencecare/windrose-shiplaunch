/**
 * The Windrose plugins added to a network that already exists (docs/existing-networks.md): main
 * site English, /fr/ French, /social/ with a classic theme, Multisite Language Switcher (from wordpress.org) linking an
 * English and a French post, an image. Helm, Anchors and Sabir are uploaded and network-activated in Network Admin as
 * a person would; nothing may change until the owner chooses (no Set up screen, links and pages as before); then a
 * language group and shared media work. Runs on a throwaway network installation
 * in existing-e2e/ (WINDROSE_E2E_HOST: the host, default localhost).
 */
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

const BASE = `https://${ process.env.WINDROSE_E2E_HOST ?? 'localhost' }/existing-e2e/`;
const PATH = '/var/www/html/web/existing-e2e';
const ZIPS = '/var/www/html/tools/.existing-zips';
const PASS = 'Windrose-existing-throwaway-3e9';
const SITES = { main: BASE, fr: `${ BASE }fr/`, social: `${ BASE }social/` };

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

async function login( page ) {
	// A fresh login each time (wp-login.php sends people already logged in straight to the dashboard).
	await page.context().clearCookies();
	await page.goto( `${ BASE }wp-login.php` );
	await page.locator( '#user_login' ).fill( 'owner' );
	await page.locator( '#user_pass' ).fill( PASS );
	await page.locator( '#wp-submit' ).click();
	await page.waitForURL( /wp-admin/ );
}

/** What a visitor gets: status, the post or page content, the hreflang links. */
async function snapshot( page, url ) {
	const response = await page.goto( url );
	const content = await page.locator( '.entry-content, .wp-block-post-content' ).first().innerHTML().catch( () => '' );
	const alternates = await page.locator( 'link[rel="alternate"][hreflang]' ).evaluateAll( ( links ) =>
		links.map( ( link ) => `${ link.hreflang } ${ link.href }` ).sort()
	);
	return { status: response.status(), content, alternates };
}

const state = {};

test.use( { storageState: { cookies: [], origins: [] }, locale: 'en-GB' } );
test.describe.configure( { mode: 'serial' } );

test( 'before: the network as it is', async ( { page } ) => {
	state.en = wp( SITES.main, 'post', 'list', '--name=welcome', '--field=ID' );
	state.fr = wp( SITES.fr, 'post', 'list', '--name=bienvenue', '--field=ID' );
	state.image = wp( SITES.main, 'post', 'list', '--post_type=attachment', '--field=ID' );
	state.urls = {
		en: wp( SITES.main, 'eval', `echo get_permalink( ${ state.en } );` ),
		fr: wp( SITES.fr, 'eval', `echo get_permalink( ${ state.fr } );` ),
		social: SITES.social,
	};
	state.before = {};
	for ( const [ key, url ] of Object.entries( state.urls ) ) {
		state.before[ key ] = await snapshot( page, url );
		expect( state.before[ key ].status ).toBe( 200 );
	}
	// Multisite Language Switcher links the two posts, and (without language groups) also offers Social as English.
	expect( state.before.fr.alternates ).toEqual( [ `en-US ${ state.urls.en }`, `en-US ${ SITES.social }`, `fr ${ state.urls.fr }` ].sort() );
	state.links = {
		en: wp( SITES.main, 'option', 'get', `msls_${ state.en }`, '--format=json' ),
		fr: wp( SITES.fr, 'option', 'get', `msls_${ state.fr }`, '--format=json' ),
	};
	state.media = Object.fromEntries( Object.entries( SITES ).map( ( [ key, url ] ) => [ key, wp( url, 'post', 'list', '--post_type=attachment', '--format=count' ) ] ) );
} );

test( 'Helm, Anchors and Sabir are uploaded and network-activated in Network Admin', async ( { page } ) => {
	await login( page );
	for ( const slug of [ 'windrose-helm', 'windrose-anchors', 'windrose-sabir' ] ) {
		await page.goto( `${ BASE }wp-admin/network/plugin-install.php?tab=upload` );
		await page.locator( '#pluginzip' ).setInputFiles( `${ ZIPS }/${ slug }.zip` );
		await page.locator( '#install-plugin-submit' ).click();
		await page.getByRole( 'link', { name: 'Network Activate' } ).click();
		await expect( page.locator( '#message, .notice-success' ).first() ).toBeVisible();
	}
	const active = wp( BASE, 'plugin', 'list', '--status=active-network', '--field=name' ).split( '\n' ).sort();
	expect( active ).toEqual( [ 'multisite-language-switcher', 'windrose-anchors', 'windrose-helm', 'windrose-sabir' ] );
} );

test( 'nothing changes until the owner chooses', async ( { page } ) => {
	// No Set up screen: it belongs to installations from the zip.
	await login( page );
	await expect( page ).not.toHaveURL( /windrose-helm-setup/ );
	await page.goto( `${ BASE }wp-admin/network/` );
	await expect( page.locator( '#adminmenu a[href*="page=windrose-helm"]' ).first() ).toBeVisible();
	await expect( page.locator( '#adminmenu a[href$="page=windrose-helm-setup"]' ) ).toHaveCount( 0 );
	await expect( page.locator( '.notice', { hasText: 'Set up the network' } ) ).toHaveCount( 0 );
	expect( tryWp( BASE, 'site', 'option', 'get', 'windrose_helm_setup', '--format=json' ) ).toBe( '' );

	// A site uses a classic theme: the block-only defaults start off and Site Health reports instead.
	await page.goto( `${ BASE }wp-admin/network/admin.php?page=windrose-helm` );
	await expect( page.locator( '#windrose-helm-app' ) ).not.toContainText( 'Loading' );
	const defaults = JSON.parse( wp( BASE, 'site', 'option', 'get', 'windrose_helm_defaults', '--format=json' ) );
	expect( defaults ).toEqual( { block_themes: false, classic_screens: false, classic_editor: false, classic_block: true } );
	expect( wp( SITES.social, 'option', 'get', 'stylesheet' ) ).toBe( 'twentytwentyone' );
	const health = JSON.parse( wp( SITES.social, 'eval', 'echo wp_json_encode( Windrose\\Helm\\Health::test_block_theme() );' ) );
	expect( health.status ).toBe( 'recommended' );
	const customizer = await page.goto( `${ SITES.social }wp-admin/customize.php` );
	expect( customizer.status() ).toBe( 200 );

	// Pages, links and media as before.
	for ( const [ key, url ] of Object.entries( state.urls ) ) {
		expect( await snapshot( page, url ) ).toEqual( state.before[ key ] );
	}
	expect( wp( SITES.main, 'option', 'get', `msls_${ state.en }`, '--format=json' ) ).toBe( state.links.en );
	expect( wp( SITES.fr, 'option', 'get', `msls_${ state.fr }`, '--format=json' ) ).toBe( state.links.fr );
	for ( const [ key, url ] of Object.entries( SITES ) ) {
		expect( wp( url, 'post', 'list', '--post_type=attachment', '--format=count' ) ).toBe( state.media[ key ] );
	}
	expect( JSON.parse( tryWp( BASE, 'site', 'option', 'get', 'windrose_anchors_sites', '--format=json' ) || '[]' ) ).toEqual( [] );
	expect( JSON.parse( tryWp( BASE, 'site', 'option', 'get', 'windrose_sabir_groups', '--format=json' ) || '[]' ) ).toEqual( [] );
} );

test( 'then a language group and shared media work', async ( { page } ) => {
	const ids = JSON.parse( wp( BASE, 'site', 'list', '--fields=blog_id,path', '--format=json' ) );
	const id = ( path ) => Number( ids.find( ( site ) => site.path === path ).blog_id );
	const main = id( '/existing-e2e/' );
	const fr = id( '/existing-e2e/fr/' );

	// English and French form a language group: Social drops out of the translations.
	wp( BASE, 'eval', `$r = Windrose\\Sabir\\Groups::save( 0, 'Languages', array( ${ main }, ${ fr } ), ${ main } ); if ( is_wp_error( $r ) ) { WP_CLI::error( $r->get_error_message() ); }` );
	const french = await snapshot( page, state.urls.fr );
	// One English site left among the translations: MSLS writes the short code.
	expect( french.alternates ).toEqual( [ `en ${ state.urls.en }`, `fr ${ state.urls.fr }` ] );
	expect( french.content ).toBe( state.before.fr.content );
	expect( ( await snapshot( page, SITES.social ) ).alternates ).toEqual( [] );
	expect( wp( SITES.main, 'option', 'get', `msls_${ state.en }`, '--format=json' ) ).toBe( state.links.en );

	// The French site may use network media; the English post's image, shared, becomes a network item there.
	wp( BASE, 'eval', `Windrose\\Anchors\\Settings::set_allowed( array( ${ fr } ), true ); $r = Windrose\\Anchors\\Hub::set_shared( ${ state.image }, true ); if ( is_wp_error( $r ) ) { WP_CLI::error( $r->get_error_message() ); }` );
	const item = JSON.parse( wp( SITES.fr, 'eval', `$r = Windrose\\Anchors\\Proxy::create( ${ state.image } ); if ( is_wp_error( $r ) ) { WP_CLI::error( $r->get_error_message() ); } echo wp_json_encode( array( 'id' => $r['id'], 'url' => wp_get_attachment_url( $r['id'] ) ) );` ) );
	expect( item.url ).toBe( wp( SITES.main, 'eval', `echo wp_get_attachment_url( ${ state.image } );` ) );
	const file = await page.request.get( item.url );
	expect( file.status() ).toBe( 200 );
	// Pages still as before.
	expect( ( await snapshot( page, state.urls.en ) ).content ).toBe( state.before.en.content );
} );
