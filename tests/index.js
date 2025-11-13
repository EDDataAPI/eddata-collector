const { systemsDb, tradeDb } = require('../lib/db')
const { getISOTimestamp, timeBetweenTimestamps } = require('../lib/utils/dates')
const { getNearbySystemSectors } = require('../lib/system-sectors')

;(async () => {
  console.log('Starting speed test …')
  const distance = 200

  /*
  const test = {
    x: 5,
    y: 10,
    z: 4
  }

  const colonia = {
    systemName: 'Colonia',
    x: -9530.5,
    y: -910.28125,
    z: 19808.125
  }
  */

  const sol = {
    systemName: 'Sol',
    x: 0,
    y: 0,
    z: 0
  }

  const query = {
    distance,
    ...sol
  }

  const testResults = {
    originAndDistance: query
  }

  console.time('Speed test')

  if (query.systemName) {
    const getSystemInformation = systemsDb.prepare('SELECT * FROM systems where systemName = @systemName COLLATE NOCASE')
    console.time('Get system location information')
    testResults.systemLocationInformation = getSystemInformation.get(query)
    console.timeEnd('Get system location information')
  }

  console.time('Get trade commodities by date')
  const {
    minTimestamp,
    maxTimestamp,
    last24Hours,
    last7Days,
    last30Days,
    last90Days,
    moreThan90Days
  } = tradeDb.prepare(`SELECT 
    MIN(updatedAt) as minTimestamp,
    MAX(updatedAt) as maxTimestamp,
    (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last24HoursTimestamp) as last24Hours,
    (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last7DaysTimestamp) as last7Days,
    (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last30DaysTimestamp) as last30Days,
    (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last90DaysTimestamp) as last90Days,
    (SELECT COUNT(*) FROM commodities WHERE updatedAt <= @last90DaysTimestamp) as moreThan90Days
    FROM commodities`)
    .get({
      last24HoursTimestamp: getISOTimestamp(-1),
      last7DaysTimestamp: getISOTimestamp(-7),
      last30DaysTimestamp: getISOTimestamp(-30),
      last90DaysTimestamp: getISOTimestamp(-90)
    })
  testResults.commodityTimestamps = {
    minTimestamp,
    maxTimestamp,
    timestampDiff: timeBetweenTimestamps(minTimestamp, maxTimestamp),
    last24Hours: last24Hours.toLocaleString(),
    last7Days: last7Days.toLocaleString(),
    last30Days: last30Days.toLocaleString(),
    last90Days: last90Days.toLocaleString(),
    moreThan90Days: moreThan90Days.toLocaleString()
  }
  console.log(testResults.commodityTimestamps, getISOTimestamp(-30))
  console.timeEnd('Get trade commodities by date')

  const getCommoditesCount = tradeDb.prepare('SELECT COUNT(*) as count FROM commodities')
  console.time('Count number of trade commodities')
  testResults.totalCommodities = getCommoditesCount.get().count.toLocaleString()
  console.timeEnd('Count number of trade commodities')

  const getSystemsCount = systemsDb.prepare('SELECT COUNT(*) as count FROM systems')
  console.time('Count number of known systems in galaxy')
  testResults.totalKnownSystemsInGalaxy = getSystemsCount.get().count.toLocaleString()
  console.timeEnd('Count number of known systems in galaxy')

  console.time('Find a specific commodity on nearby markets')
  const findCommodityOnNearbyMarkets = tradeDb.prepare(`
    SELECT *, sqrt(power(systemX-@x,2)+power(systemY-@y,2)+power(systemZ-@z,2)) AS distance FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
    AND systemX BETWEEN (@x-@distance) AND (@x+@distance)
    AND systemY BETWEEN (@y-@distance) AND (@y+@distance)
    AND systemZ BETWEEN (@z-@distance) AND (@z+@distance)
    AND sqrt(power(systemX-@x,2)+power(systemY-@y,2)+power(systemZ-@z,2)) < @distance
    ORDER BY distance
  `)
  testResults.instancesOfSpecificCommodityOnNearbyMarkets = findCommodityOnNearbyMarkets.all({ ...query, commodityName: 'gold' }).length.toLocaleString()
  console.timeEnd('Find a specific commodity on nearby markets')

  console.time('Find a specific commodity in a specific system')
  testResults.goldInSystem = await tradeDb.prepare('SELECT * FROM commodities WHERE systemName = @systemName COLLATE NOCASE AND commodityName = @commodityName COLLATE NOCASE').all({ ...query, commodityName: 'gold' })
  console.timeEnd('Find a specific commodity in a specific system')

  const nearbySectors = getNearbySystemSectors(query.x, query.y, query.z, query.distance)
  const findSystemsBySector = systemsDb.prepare(`
    SELECT *, sqrt(power(systemX-@x,2)+power(systemY-@y,2)+power(systemZ-@z,2)) AS distance FROM systems
    WHERE systemSector IN ('${nearbySectors.join("', '")}')
    AND sqrt(power(systemX-@x,2)+power(systemY-@y,2)+power(systemZ-@z,2)) < @distance
    ORDER BY distance
  `)

  console.time('Find all nearby systems by sector')
  testResults.numberOfNearbySystemsFoundBySector = findSystemsBySector.all({ ...query }).length.toLocaleString()
  console.timeEnd('Find all nearby systems by sector')

  // console.log('Test data:', testResults)
  console.timeEnd('Speed test')

  process.exit()
})()
