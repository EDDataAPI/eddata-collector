const SqliteDatabase = require('better-sqlite3')
const {
  initializeDatabases,
  updateCommodityStats,
  updateCommodityReport
} = require('../../lib/stats/commodity-stats')
const { createSnapshots, areSnapshotsFresh, getSnapshotPaths } = require('./snapshot-databases')
const fs = require('fs')
const path = require('path')
const { EDDATA_CACHE_DIR } = require('../../lib/consts')

;(async () => {
  console.log('Updating stats for commodities…')

  // Create or refresh database snapshots
  if (!areSnapshotsFresh()) {
    console.log('Creating database snapshots for stats generation...')
    createSnapshots()
  } else {
    console.log('Using existing database snapshots (still fresh)')
  }

  // Connect to snapshot databases
  const paths = getSnapshotPaths()
  const tradeDb = new SqliteDatabase(paths.tradeDb, { readonly: true })
  const systemsDb = new SqliteDatabase(paths.systemsDb, { readonly: true })
  const stationsDb = new SqliteDatabase(paths.stationsDb, { readonly: true })

  // Initialize commodity stats with snapshot connections
  initializeDatabases({ tradeDb, systemsDb, stationsDb })

  // Fixed: The commodity stats now exclude Fleet Carrier data and use proper joins
  console.time('Update stats for commodities')
  await updateCommodityStats()
  console.timeEnd('Update stats for commodities')

  // Generate commodity ticker (empty for now, can be populated with price changes later)
  console.log('Generating commodity ticker...')
  const tickerPath = path.join(EDDATA_CACHE_DIR, 'commodity-ticker.json')
  const ticker = {
    ticker: [], // TODO: Add price change tracking
    timestamp: new Date().toISOString()
  }
  fs.writeFileSync(tickerPath, JSON.stringify(ticker, null, 2))

  // Fixed: The reports now join with the stations table for system positional data
  console.log('Updating Core Systems commodity data…')
  console.time('Update Core Systems commodity data')
  await updateCommodityReport('core-systems-1000', 'Sol', 500, 1000)
  console.timeEnd('Update Core Systems commodity data')

  console.log('Updating Colonia Systems commodity data…')
  console.time('Update Colonia Systems commodity data')
  await updateCommodityReport('colonia-systems-1000', 'Colonia', 500, 1000)
  console.timeEnd('Update Colonia Systems commodity data')

  // Close snapshot connections
  tradeDb.close()
  systemsDb.close()
  stationsDb.close()

  console.log('\n✓ All commodity stats updated using database snapshots')
})()
