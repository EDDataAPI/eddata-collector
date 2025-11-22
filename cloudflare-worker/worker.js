/**
 * Cloudflare Worker - EDData API Gateway
 *
 * Optional edge caching layer for EDData Collector
 * Deploy to Cloudflare Workers for global CDN with intelligent caching
 *
 * Features:
 * - Cache static stats files at edge (300+ locations worldwide)
 * - Reduce load on origin server
 * - DDoS protection included
 * - Free tier: 100k requests/day
 *
 * Setup:
 * 1. Create Cloudflare Worker at https://dash.cloudflare.com
 * 2. Copy this code into the worker editor
 * 3. Set environment variable: ORIGIN_URL (your container URL)
 * 4. Deploy and route your domain to the worker
 */

export default {
  async fetch (request, env, ctx) {
    const url = new URL(request.url)

    // Get origin URL from environment or fallback
    const originUrl = env.ORIGIN_URL || 'https://eddata-api.example.com'

    // CORS headers for browser requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Only allow GET/HEAD requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders
      })
    }

    try {
      // Check Cloudflare cache first
      // eslint-disable-next-line no-undef
      const cache = caches.default
      let response = await cache.match(request)

      if (response) {
        // Return cached response with HIT header
        const newHeaders = new Headers(response.headers)
        newHeaders.set('CF-Cache-Status', 'HIT')
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value)
        })

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        })
      }

      // Fetch from origin
      const originResponse = await fetch(originUrl + url.pathname + url.search, {
        method: request.method,
        headers: request.headers,
        cf: {
          // Cloudflare-specific options
          cacheTtl: getCacheTTL(url.pathname),
          cacheEverything: shouldCache(url.pathname)
        }
      })

      // Clone response before modifying
      response = new Response(originResponse.body, originResponse)

      // Add cache headers based on path
      const cacheControl = getCacheControl(url.pathname)
      const newHeaders = new Headers(response.headers)

      if (cacheControl) {
        newHeaders.set('Cache-Control', cacheControl)
      }

      // Add CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value)
      })

      // Add cache status
      newHeaders.set('CF-Cache-Status', 'MISS')
      newHeaders.set('X-Origin-URL', originUrl)

      // Create final response
      const finalResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      })

      // Cache if appropriate
      if (shouldCache(url.pathname) && response.ok) {
        ctx.waitUntil(cache.put(request, finalResponse.clone()))
      }

      return finalResponse
    } catch (error) {
      // Error handling
      return new Response(JSON.stringify({
        error: 'Gateway error',
        message: error.message,
        timestamp: new Date().toISOString()
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
    }
  }
}

/**
 * Determine if a path should be cached
 */
function shouldCache (pathname) {
  // Cache all stats files
  if (pathname.includes('/stats/')) return true
  if (pathname.endsWith('.json')) return true

  // Cache commodity data
  if (pathname.includes('/commodities/')) return true

  // Cache station/system lookups (but not searches with many results)
  if (pathname.match(/\/(stations|systems)\/\d+$/)) return true

  // Don't cache admin endpoints or dynamic searches
  if (pathname.includes('/admin/')) return false
  if (pathname.includes('/search')) return false

  return false
}

/**
 * Get cache TTL in seconds based on path
 */
function getCacheTTL (pathname) {
  // Stats files: 1 hour (regenerated hourly)
  if (pathname.includes('/stats/')) return 3600

  // Database stats: 1 hour
  if (pathname.endsWith('/database-stats.json')) return 3600

  // Commodity ticker: 5 minutes (more volatile)
  if (pathname.endsWith('/commodity-ticker.json')) return 300

  // Individual station/system: 24 hours
  if (pathname.match(/\/(stations|systems)\/\d+$/)) return 86400

  // Commodity data: 1 hour
  if (pathname.includes('/commodities/')) return 3600

  // Default: 5 minutes
  return 300
}

/**
 * Get Cache-Control header value
 */
function getCacheControl (pathname) {
  const ttl = getCacheTTL(pathname)

  // Public cache with revalidation
  return `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=60`
}
