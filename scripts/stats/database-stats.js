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

  // Create snapshots if they don't exist or are stale
  if (!areSnapshotsFresh()) {
    console.log('Refreshing database snapshots...')
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
  const commodityStats = tradeDb.prepare(`
    SELECT
      COUNT(*) AS marketOrders,
      (SELECT COUNT(DISTINCT(commodityName)) as count FROM commodities) AS uniqueCommodities,
      (SELECT COUNT(DISTINCT(marketId)) as count FROM commodities) AS tradeMarkets,
      (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last24HoursTimestamp) as updatedInLast24Hours
    FROM commodities
    `).get({
    last24HoursTimestamp: getISOTimestamp(-1)
  })
  const stationStats = stationsDb.prepare(`
  SELECT
    (SELECT COUNT(*) FROM stations WHERE stationType != 'FleetCarrier') as stations,
    (SELECT COUNT(*) FROM stations WHERE stationType = 'FleetCarrier') as fleetCarriers,
    (SELECT COUNT(*) FROM stations WHERE updatedAt > @last24HoursTimestamp) as updatedInLast24Hours
  FROM stations
  `).get({
    last24HoursTimestamp: getISOTimestamp(-1)
  })
  const stats = {
    systems: systemsDb.prepare('SELECT COUNT(*) as count FROM systems').get().count,
    pointsOfInterest: locationsDb.prepare('SELECT COUNT(*) as count FROM locations').get().count,
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
    updatedInLast24Hours: commodityStats?.updatedInLast24Hours ?? 0 + stationStats?.updatedInLast24Hours ?? 0,
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
