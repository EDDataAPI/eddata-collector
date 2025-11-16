// const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../lib/db')
// const { getISOTimestamp } = require('../lib/utils/dates')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { EDDATA_STATIONS_DB, EDDATA_SYSTEMS_DB, EDDATA_TRADE_DB, EDDATA_CACHE_DIR } = require('../lib/consts')

// The purpose of this is to be a place for any logic that needs to run at
// startup, before the service goes back online. It is not a script in the
// typical sense, in that it can / should only be invoked from the main
// thread, when the database is not otherwise being written to.
//
// The use case is primarily to support releases that involve changes to data
// in any of the databases (e.g. after refactoring, bug fixes, etc).
//
// The intention is that it should be safe to run any of these tasks multiple
// times, and that once they have been run at least once in production, any
// actions configured to run here will be removed from subsequent releases.

module.exports = async () => {
  console.time('Startup maintenance')

  console.log('Performing maintenance tasks...')

  // Generate database statistics and cache on every startup if databases exist
  const hasDatabases = fs.existsSync(EDDATA_STATIONS_DB) ||
                       fs.existsSync(EDDATA_SYSTEMS_DB) ||
                       fs.existsSync(EDDATA_TRADE_DB)

  if (hasDatabases) {
    console.log('Generating database statistics and cache...')
    try {
      execSync('npm run stats', { stdio: 'inherit' })
      console.log('Database statistics and cache generated successfully')
    } catch (error) {
      console.error('Failed to generate database statistics:', error.message)
    }
  } else {
    console.log('No databases found, creating empty cache files...')
    
    // Ensure cache directory exists
    if (!fs.existsSync(EDDATA_CACHE_DIR)) {
      fs.mkdirSync(EDDATA_CACHE_DIR, { recursive: true })
    }
    
    // Create empty cache files to prevent API errors
    const emptyCacheFiles = [
      { name: 'commodities.json', data: { commodities: [], timestamp: new Date().toISOString() } },
      { name: 'database-stats.json', data: { systems: { total: 0 }, locations: { total: 0, stations: 0, carriers: 0 }, trade: { markets: 0, orders: 0, uniqueCommodities: 0 }, timestamp: new Date().toISOString() } },
      { name: 'commodity-ticker.json', data: { ticker: [], timestamp: new Date().toISOString() } },
      { name: 'galnet-news.json', data: { articles: [], timestamp: new Date().toISOString() } }
    ]
    
    for (const file of emptyCacheFiles) {
      const filePath = path.join(EDDATA_CACHE_DIR, file.name)
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(file.data, null, 2))
        console.log(`Created empty cache file: ${file.name}`)
      }
    }
    
    // Run galnet-news to fetch real data (doesn't require database)
    try {
      execSync('npm run stats:galnet', { stdio: 'inherit' })
    } catch (error) {
      console.error('Failed to fetch GalNet news:', error.message)
    }
  }

  console.timeEnd('Startup maintenance')
}
