/**
 * Router Worker for awnist.com
 *
 * Routes subfolder paths to the appropriate Cloudflare Pages projects.
 * Add new apps by adding a new entry to ROUTES.
 */

const ROUTES = [
  { prefix: '/slop-cop', target: 'https://slopcop.pages.dev' },
]

export default {
  async fetch(request) {
    const url = new URL(request.url)

    for (const { prefix, target } of ROUTES) {
      if (url.pathname === prefix || url.pathname.startsWith(prefix + '/')) {
        // Strip the prefix and proxy to the Pages project
        const targetUrl = new URL(url.pathname.slice(prefix.length) || '/', target)
        targetUrl.search = url.search

        const proxied = new Request(targetUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body,
          redirect: 'manual',
        })

        const response = await fetch(proxied)

        // Rewrite any Location headers on redirects to keep the prefix
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('Location')
          if (location && location.startsWith('/')) {
            const headers = new Headers(response.headers)
            headers.set('Location', prefix + location)
            return new Response(response.body, { status: response.status, headers })
          }
        }

        return response
      }
    }

    return new Response('Not found', { status: 404 })
  }
}
