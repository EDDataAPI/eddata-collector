const fs = require('fs')
const path = require('path')
const https = require('https')
const { EDDATA_CACHE_DIR } = require('../../lib/consts')

// Fetch GalNet news from official Elite Dangerous Community API
async function fetchGalNetNews () {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'cms.zaonce.net',
      path: '/en-GB/jsonapi/node/galnet_article?&sort=-published_at&page[offset]=0&page[limit]=50',
      method: 'GET',
      headers: {
        'User-Agent': 'EDData-Collector/1.0'
      }
    }

    https.get(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        console.log('[DEBUG] API Response Status:', res.statusCode)
        console.log('[DEBUG] API Response Length:', data.length, 'bytes')
        
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data)
            console.log('[DEBUG] Successfully parsed JSON response')
            resolve(json)
          } catch (error) {
            console.error('[DEBUG] JSON Parse Error:', error.message)
            console.error('[DEBUG] Raw data:', data.substring(0, 500))
            reject(new Error('Failed to parse GalNet news JSON: ' + error.message))
          }
        } else {
          console.error('[DEBUG] API returned non-200 status:', res.statusCode)
          reject(new Error(`GalNet API returned status ${res.statusCode}`))
        }
      })
    }).on('error', (error) => {
      reject(new Error('Failed to fetch GalNet news: ' + error.message))
    })
  })
}

// Transform GalNet API response to simplified format
function transformGalNetNews (apiResponse) {
  console.log('[DEBUG] API Response type:', typeof apiResponse)
  console.log('[DEBUG] API Response keys:', Object.keys(apiResponse || {}))
  
  if (!apiResponse.data || !Array.isArray(apiResponse.data)) {
    console.warn('[DEBUG] apiResponse.data is not an array or missing. Response:', JSON.stringify(apiResponse).substring(0, 200))
    return { articles: [], timestamp: new Date().toISOString() }
  }

  console.log('[DEBUG] Found', apiResponse.data.length, 'articles in API response')
  const articles = apiResponse.data.map(article => ({
    id: article.id,
    title: article.attributes?.title || 'Untitled',
    content: article.attributes?.body?.value || '',
    date: article.attributes?.published_at || article.attributes?.created,
    image: article.attributes?.field_galnet_image?.url || null,
    slug: article.attributes?.field_slug || null
  }))

  return {
    articles,
    timestamp: new Date().toISOString(),
    source: 'cms.zaonce.net',
    count: articles.length
  }
}

// Main execution
;(async () => {
  console.log('Fetching GalNet news…')
  console.time('Fetch GalNet news')

  try {
    const apiResponse = await fetchGalNetNews()
    const transformedNews = transformGalNetNews(apiResponse)

    // Ensure cache directory exists
    if (!fs.existsSync(EDDATA_CACHE_DIR)) {
      fs.mkdirSync(EDDATA_CACHE_DIR, { recursive: true })
    }

    // Save to cache
    const outputPath = path.join(EDDATA_CACHE_DIR, 'galnet-news.json')
    fs.writeFileSync(outputPath, JSON.stringify(transformedNews, null, 2))

    console.log(`✓ Saved ${transformedNews.count} GalNet articles to galnet-news.json`)
    console.timeEnd('Fetch GalNet news')
  } catch (error) {
    console.error('Failed to fetch GalNet news:', error.message)

    // Create empty fallback file to prevent API 404 errors
    const fallback = {
      articles: [],
      timestamp: new Date().toISOString(),
      error: error.message,
      source: 'fallback'
    }

    if (!fs.existsSync(EDDATA_CACHE_DIR)) {
      fs.mkdirSync(EDDATA_CACHE_DIR, { recursive: true })
    }

    const outputPath = path.join(EDDATA_CACHE_DIR, 'galnet-news.json')
    fs.writeFileSync(outputPath, JSON.stringify(fallback, null, 2))

    console.log('✓ Created empty galnet-news.json fallback')
    console.timeEnd('Fetch GalNet news')
  }
})()
