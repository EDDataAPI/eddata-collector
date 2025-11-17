# Cloudflare Worker Setup (Optional)

This directory contains an **optional** Cloudflare Worker configuration for deploying a global CDN edge layer in front of your EDData API.

## 🎯 What It Does

The worker acts as an intelligent caching proxy:
- Caches stats files at 300+ edge locations worldwide
- Reduces load on your origin server by 80-95%
- Provides DDoS protection automatically
- Adds CORS headers for browser requests
- Free tier: 100,000 requests/day

## 📊 Cache Strategy

| Path | Cache TTL | Purpose |
|------|-----------|---------|
| `/stats/database-stats.json` | 1 hour | Database stats regenerated hourly |
| `/stats/commodity-ticker.json` | 5 minutes | Trading data changes frequently |
| `/stats/*` | 1 hour | General stats files |
| `/stations/:id` | 24 hours | Station data rarely changes |
| `/systems/:id` | 24 hours | System data rarely changes |
| `/commodities/*` | 1 hour | Market data updates |
| `/search/*` | No cache | Dynamic results |
| `/admin/*` | No cache | Admin endpoints |

## 🚀 Deployment Options

### Option 1: Cloudflare Dashboard (Easiest)

1. Go to https://dash.cloudflare.com
2. Navigate to **Workers & Pages** → **Create Worker**
3. Name it `eddata-api-gateway`
4. Copy/paste contents of `worker.js` into the editor
5. Click **Save and Deploy**
6. Set environment variable:
   - Key: `ORIGIN_URL`
   - Value: `https://your-container-domain.com`
7. Add route to your domain:
   - Route: `api.yourdomain.com/*`
   - Worker: `eddata-api-gateway`

### Option 2: Wrangler CLI (Advanced)

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create wrangler.toml (see below)

# Deploy
wrangler deploy
```

**wrangler.toml:**
```toml
name = "eddata-api-gateway"
main = "worker.js"
compatibility_date = "2025-11-17"

[vars]
ORIGIN_URL = "https://your-container-domain.com"

# Optional: Custom routes
routes = [
  { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

### Option 3: GitHub Actions (CI/CD)

```yaml
# .github/workflows/deploy-worker.yml
name: Deploy Cloudflare Worker

on:
  push:
    branches: [main]
    paths:
      - 'cloudflare-worker/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          workingDirectory: cloudflare-worker
```

## 🧪 Testing

### 1. Test Cache Headers

```bash
# First request (MISS)
curl -I https://api.yourdomain.com/stats/database-stats.json

# Response headers:
# CF-Cache-Status: MISS
# Cache-Control: public, max-age=3600
# X-Origin-URL: https://your-container.com

# Second request (HIT)
curl -I https://api.yourdomain.com/stats/database-stats.json

# Response headers:
# CF-Cache-Status: HIT
# Age: 42
```

### 2. Test CORS

```bash
curl -H "Origin: https://example.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://api.yourdomain.com/stats/commodity-ticker.json

# Should return CORS headers
```

### 3. Monitor Cache Hit Rate

Visit Cloudflare Dashboard → Analytics → Workers
- See cache hit/miss ratio
- Monitor request volume
- Check error rates

## 📈 Expected Performance Improvements

**Without Worker:**
- Response time: 50-500ms (depending on user location)
- Origin requests: 100%
- Server load: High during peak times

**With Worker:**
- Response time: 10-50ms (edge cache)
- Origin requests: 5-20% (cached at edge)
- Server load: Reduced by 80-95%

## 💰 Cost

**Free Tier:**
- 100,000 requests/day
- Unlimited bandwidth
- No egress fees

**Paid Tier ($5/month):**
- 10 million requests/month
- $0.50 per additional million

For most use cases, the free tier is sufficient!

## 🔧 Configuration

### Environment Variables

Set in Cloudflare Dashboard or `wrangler.toml`:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ORIGIN_URL` | Yes | Your container URL | `https://eddata.example.com` |

### Advanced: Custom Cache Rules

Modify `getCacheTTL()` in `worker.js`:

```javascript
function getCacheTTL(pathname) {
  // Custom rule: cache rare commodities longer
  if (pathname.includes('/commodities/rare/')) return 86400 // 24h
  
  // Custom rule: shorter cache for popular routes
  if (pathname.includes('/hot-trades')) return 60 // 1min
  
  // ... existing rules
}
```

## 🐛 Troubleshooting

### Cache Not Working

1. Check `CF-Cache-Status` header
2. Verify `Cache-Control` header is set
3. Ensure path matches cache rules in `shouldCache()`

### Origin Unreachable

1. Check `ORIGIN_URL` environment variable
2. Verify container is accessible from internet
3. Check worker logs in Cloudflare Dashboard

### CORS Errors

Worker automatically adds CORS headers. If issues persist:
- Check browser console for specific error
- Verify `Access-Control-Allow-Origin` header in response

## 📚 Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## 🔄 Alternative: Use Without Worker

If you decide not to use the worker:
1. Simply don't deploy it
2. Point your domain directly to the container
3. Use Cloudflare's standard CDN (still provides caching)

The container works perfectly fine without the worker - this is just an optimization!

---

**Created:** November 17, 2025  
**Status:** Optional Enhancement  
**Effort:** 10-15 minutes to set up
