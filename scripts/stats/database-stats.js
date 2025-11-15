const fs = require('fs')
const { EDDATA_CACHE_DIR, EDDATA_DATABASE_STATS } = require('../../lib/consts')
const { getISOTimestamp } = require('../../lib/utils/dates')
const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../../lib/db')

// TODO This needs a complete rewrite, it's both slow and not very precise
// Any changes should be synced with the front end
;(async () => {
  console.log('Updating database stats…')
  console.time('Update database stats')
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
})()
