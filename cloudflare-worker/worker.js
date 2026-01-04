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

    // Health check: don't cache, pass through directly
    if (url.pathname === '/health') {
      try {
        const healthResponse = await fetch(originUrl + '/health', {
          method: 'GET',
          headers: { 'User-Agent': 'Cloudflare-Worker-Health-Check' }
        })

        const newHeaders = new Headers(healthResponse.headers)
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value)
        })
        newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate')

        return new Response(healthResponse.body, {
          status: healthResponse.status,
          headers: newHeaders
        })
      } catch (error) {
        return new Response(JSON.stringify({ status: 'unhealthy', error: error.message }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        })
      }
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

      // Fetch from origin with optimized settings
      const originHeaders = new Headers(request.headers)
      originHeaders.set('Accept-Encoding', 'gzip, deflate, br')
      originHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '')

      const originResponse = await fetch(originUrl + url.pathname + url.search, {
        method: request.method,
        headers: originHeaders,
        cf: {
          // Cloudflare-specific options
          cacheTtl: getCacheTTL(url.pathname),
          cacheEverything: shouldCache(url.pathname),
          // Enable compression
          polish: 'lossy',
          minify: {
            javascript: false,
            css: false,
            html: false
          }
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout
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
  // Never cache health checks, admin, or dynamic searches
  if (pathname === '/health') return false
  if (pathname.includes('/admin/')) return false
  if (pathname.includes('/search')) return false
  if (pathname.includes('/upload')) return false

  // Cache all stats files
  if (pathname.includes('/stats/')) return true

  // Cache JSON responses
  if (pathname.endsWith('.json')) return true

  // Cache commodity data (but with shorter TTL for ticker)
  if (pathname.includes('/commodities/')) return true

  // Cache station/system lookups (but not list endpoints)
  if (pathname.match(/\/(stations|systems)\/[^/]+$/)) return true
  if (pathname.match(/\/(stations|systems)\/\d+/)) return true

  // Cache galnet news
  if (pathname.includes('/galnet')) return true

  return false
}

/**
 * Get cache TTL in seconds based on path
 */
function getCacheTTL (pathname) {
  // Health check: no cache
  if (pathname === '/health') return 0

  // Commodity ticker: 3 minutes (frequent updates)
  if (pathname.endsWith('/commodity-ticker.json')) return 180

  // Database stats: 30 minutes (updated every 6 hours, but allow fresher cache)
  if (pathname.endsWith('/database-stats.json')) return 1800

  // General stats files: 1 hour
  if (pathname.includes('/stats/')) return 3600

  // GalNet news: 6 hours (rarely changes)
  if (pathname.includes('/galnet')) return 21600

  // Individual station/system: 24 hours (static data)
  if (pathname.match(/\/(stations|systems)\/[^/]+$/)) return 86400

  // Commodity market data: 30 minutes
  if (pathname.includes('/commodities/')) return 1800

  // Individual commodity files: 1 hour
  if (pathname.match(/\/commodities\/[^/]+\.json$/)) return 3600

  // Default: 10 minutes
  return 600
}

/**
 * Get Cache-Control header value
 */
function getCacheControl (pathname) {
  const ttl = getCacheTTL(pathname)

  // No cache for health checks
  if (pathname === '/health') {
    return 'no-cache, no-store, must-revalidate'
  }

  // Stale-while-revalidate allows serving stale content while fetching fresh
  // Set to 2x the TTL for better resilience during origin issues
  const staleWhileRevalidate = Math.min(ttl * 2, 3600)

  // Stale-if-error allows serving stale content if origin is down
  const staleIfError = Math.min(ttl * 4, 86400)

  // Public cache with revalidation strategies
  return `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${staleWhileRevalidate}, stale-if-error=${staleIfError}`
}
