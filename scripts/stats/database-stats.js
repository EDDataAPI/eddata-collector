const fs = require('fs')
const SqliteDatabase = require('better-sqlite3')
const { EDDATA_CACHE_DIR, EDDATA_DATABASE_STATS } = require('../../lib/consts')
const { getISOTimestamp } = require('../../lib/utils/dates')
const { createSnapshots, areSnapshotsFresh, getSnapshotPaths } = require('./snapshot-databases')

// Stats generation now uses database snapshots to avoid blocking production
// Snapshots are created hourly and provide consistent, fast stats queries
;(async () => {
  console.log('Updating database stats…')
  console.time('Update database stats')

  // Create or refresh database snapshots (only if stale)
  // Changed: Don't force refresh every time to avoid DB locks
  if (!areSnapshotsFresh()) {
    console.log('Creating database snapshots for stats generation...')
    createSnapshots()
  } else {
    console.log('Using existing database snapshots (still fresh)')
  }

  // Connect to snapshot databases (read-only, no WAL mode needed)
  const paths = getSnapshotPaths()
  const systemsDb = new SqliteDatabase(paths.systemsDb, { readonly: true })
  const locationsDb = new SqliteDatabase(paths.locationsDb, { readonly: true })
  const stationsDb = new SqliteDatabase(paths.stationsDb, { readonly: true })
  const tradeDb = new SqliteDatabase(paths.tradeDb, { readonly: true })

  // Optimized: Single combined query instead of 4 sub-queries for commodity stats
  const commodityStats = tradeDb.prepare(`
    SELECT
      COUNT(*) AS marketOrders,
      COUNT(DISTINCT commodityName) AS uniqueCommodities,
      COUNT(DISTINCT marketId) AS tradeMarkets,
      SUM(CASE WHEN updatedAt > @last24HoursTimestamp THEN 1 ELSE 0 END) AS updatedInLast24Hours
    FROM commodities
  `).get({
    last24HoursTimestamp: getISOTimestamp(-1)
  })

  // Optimized: Single combined query with CASE statements instead of 3 sub-queries
  const stationStats = stationsDb.prepare(`
    SELECT
      SUM(CASE WHEN stationType != 'FleetCarrier' THEN 1 ELSE 0 END) AS stations,
      SUM(CASE WHEN stationType = 'FleetCarrier' THEN 1 ELSE 0 END) AS fleetCarriers,
      SUM(CASE WHEN updatedAt > @last24HoursTimestamp THEN 1 ELSE 0 END) AS updatedInLast24Hours
    FROM stations
  `).get({
    last24HoursTimestamp: getISOTimestamp(-1)
  })

  // Simple COUNT queries for single-value stats
  const systemCount = systemsDb.prepare('SELECT COUNT(*) as count FROM systems').get().count
  const locationCount = locationsDb.prepare('SELECT COUNT(*) as count FROM locations').get().count

  // Build stats object with null-safe fallbacks
  const stats = {
    systems: systemCount || 0,
    pointsOfInterest: locationCount || 0,
    stations: {
      stations: stationStats?.stations ?? 0,
      carriers: stationStats?.fleetCarriers ?? 0,
      updatedInLast24Hours: stationStats?.updatedInLast24Hours ?? 0
    },
    trade: {
      markets: commodityStats?.tradeMarkets ?? 0,
      orders: commodityStats?.marketOrders ?? 0,
      updatedInLast24Hours: commodityStats?.updatedInLast24Hours ?? 0,
      uniqueCommodities: commodityStats?.uniqueCommodities ?? 0
    },
    updatedInLast24Hours: (commodityStats?.updatedInLast24Hours ?? 0) + (stationStats?.updatedInLast24Hours ?? 0),
    timestamp: new Date().toISOString()
  }
  if (!fs.existsSync(EDDATA_CACHE_DIR)) { fs.mkdirSync(EDDATA_CACHE_DIR, { recursive: true }) }
  fs.writeFileSync(EDDATA_DATABASE_STATS, JSON.stringify(stats, null, 2))
  console.timeEnd('Update database stats')

  // Close snapshot connections
  systemsDb.close()
  locationsDb.close()
  stationsDb.close()
  tradeDb.close()
})()
