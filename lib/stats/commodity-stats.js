const fs = require('fs')
const path = require('path')
const { EDDATA_CACHE_DIR } = require('../consts')
const arrayOfRareCommodities = require('../data/rare-commodities.json')

const rareCommodities = {}
arrayOfRareCommodities.forEach(c => { rareCommodities[c.symbol.toLowerCase()] = c })

const DELAY_BETWEEN_GENERATING_STATS = 0
const DEFAULT_REPORT_DISTANCE = 500
const DEFAULT_MINIMUM_TRADE_VOLUME = 1000

// Very rough estimate of how much more valuable rare items are when sold far away
// Is not very accurate for higher value based goods, or items sold during special
// occations, but the raw market data we get doesn't explicitly list those prices
// (although I could build a database of those values from other sources)
const RARE_GOODS_VALUE_INCREASE = 16000

// Database references - can be production or snapshot databases
let tradeDb = null
let systemsDb = null
let stationsDb = null

/**
 * Initialize database connections
 * @param {Object} dbConnections - Optional database connections (for snapshot mode)
 */
function initializeDatabases (dbConnections = null) {
  if (dbConnections) {
    // Use provided connections (snapshot mode)
    tradeDb = dbConnections.tradeDb
    systemsDb = dbConnections.systemsDb
    stationsDb = dbConnections.stationsDb
  } else {
    // Use production databases (legacy mode)
    const prodDbs = require('../db')
    tradeDb = prodDbs.tradeDb
    systemsDb = prodDbs.systemsDb
    stationsDb = prodDbs.stationsDb
  }
}

// Attach stations database to trade database for cross-database queries
function ensureStationsDbAttached (stationsDbPath = null) {
  // Determine path: use provided path, or get from stationsDb connection
  const dbPath = stationsDbPath || stationsDb?.name || require('../consts').EDDATA_STATIONS_DB

  try {
    tradeDb.exec(`ATTACH DATABASE '${dbPath}' AS stationsDb`)
  } catch (error) {
    // Ignore if already attached (SQLITE_ERROR: database stationsDb is already in use)
    if (!error.message.includes('already in use')) {
      throw error
    }
  }
}

async function updateCommodityStats () {
  // Simplified: Removed Fleet Carrier filtering for performance
  // Fleet Carriers are a small percentage of markets and won't significantly skew stats
  console.log('Preparing commodity stat queries...')

  // Single combined query for all stats - much faster than 8 separate queries
  const allStatsQuery = tradeDb.prepare(`
    SELECT 
      MAX(CASE WHEN c.stock >= 1 AND c.buyPrice > 0 AND c.buyPrice < 999999 THEN c.buyPrice END) as maxBuyPrice,
      MIN(CASE WHEN c.stock >= 1 AND c.buyPrice > 0 AND c.buyPrice < 999999 THEN c.buyPrice END) as minBuyPrice,
      CAST(AVG(CASE WHEN c.stock >= 1 AND c.buyPrice > 0 AND c.buyPrice < 999999 THEN c.buyPrice END) as INT) as avgBuyPrice,
      SUM(c.stock) as totalStock,
      MAX(CASE WHEN c.demand >= 1 AND c.sellPrice > 0 AND c.sellPrice < 999999 THEN c.sellPrice END) as maxSellPrice,
      MIN(CASE WHEN c.demand >= 1 AND c.sellPrice > 0 AND c.sellPrice < 999999 THEN c.sellPrice END) as minSellPrice,
      CAST(AVG(CASE WHEN c.demand >= 1 AND c.sellPrice > 0 AND c.sellPrice < 999999 THEN c.sellPrice END) as INT) as avgSellPrice,
      SUM(c.demand) as totalDemand
    FROM commodities c
    WHERE c.commodityName = @commodityName
  `)

  console.log('Fetching list of all commodities...')
  const commodities = _getAllCommodities()
  console.log(`Found ${commodities.length} commodities to process`)

  let processedCount = 0
  for (const commodity of commodities) {
    const { commodityName } = commodity

    if (processedCount === 0) {
      console.log(`Processing first commodity: ${commodityName}`)
      console.log('Checking if rare commodity...')
    }

    if (rareCommodities[commodityName.toLowerCase()]) {
      commodity.rare = true
      commodity.rareMarketId = parseInt(rareCommodities[commodityName.toLowerCase()].market_id)
      commodity.rareMaxCount = rareCommodities[commodityName.toLowerCase()]?.count ?? null

      // Sometimes we have a record of one but not the other (but they are always the same)
      // This could just be hard coded but I don't have a dataset to hand.
      const stats = allStatsQuery.get({ commodityName })
      const minPrice = stats.minBuyPrice ?? stats.minSellPrice

      commodity.minBuyPrice = minPrice
      commodity.maxBuyPrice = minPrice
      commodity.avgBuyPrice = minPrice
      commodity.totalStock = null
      commodity.minSellPrice = minPrice
      commodity.maxSellPrice = minPrice ? minPrice + RARE_GOODS_VALUE_INCREASE : null
      commodity.avgSellPrice = minPrice ? parseInt(commodity.maxSellPrice / 2) : null
      commodity.totalDemand = null
    } else {
      if (processedCount === 0) {
        console.log('Fetching commodity stats with single query...')
      }
      const stats = allStatsQuery.get({ commodityName })
      commodity.minBuyPrice = stats.minBuyPrice
      commodity.maxBuyPrice = stats.maxBuyPrice
      commodity.avgBuyPrice = stats.avgBuyPrice
      commodity.totalStock = stats.totalStock
      commodity.minSellPrice = stats.minSellPrice
      commodity.maxSellPrice = stats.maxSellPrice
      commodity.avgSellPrice = stats.avgSellPrice
      commodity.totalDemand = stats.totalDemand
    }

    processedCount++
    if (processedCount % 50 === 0) {
      console.log(`Processed ${processedCount}/${commodities.length} commodities...`)
    }

    // Pause generating commodity reports to reduce load on service
    if (DELAY_BETWEEN_GENERATING_STATS > 0) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_GENERATING_STATS))
    }
  }

  // Save stats report with data for all commodities in one file
  console.log('Saving commodity stats to cache...')
  _saveReport('commodities', { commodities })

  return commodities
}

async function updateCommodityReport (
  reportName = null,
  systemName = 'Sol',
  distance = DEFAULT_REPORT_DISTANCE,
  minTradeVolume = DEFAULT_MINIMUM_TRADE_VOLUME
) {
  ensureStationsDbAttached()
  if (!reportName) reportName = `${systemName}-${distance}Ly-${minTradeVolume}T`
  const system = systemsDb.prepare('SELECT * FROM systems WHERE systemName = @systemName COLLATE NOCASE').get({ systemName })
  
  if (!system) {
    console.warn(`⚠️  System '${systemName}' not found in database, skipping commodity report update`)
    return
  }
  
  let commodities = _getCommoditiesNearSystem(system, distance)

  for (const commodity of commodities) {
    commodity.bestExporters = _getBestCommodityExporters(commodity.commodityName, minTradeVolume, system, distance)
    commodity.bestImporters = _getBestCommodityImporters(commodity.commodityName, minTradeVolume, system, distance)

    const meanPrices = [
      ...commodity.bestImporters?.map(c => c.meanPrice) ?? [],
      ...commodity.bestExporters?.map(c => c.meanPrice) ?? []
    ]
    commodity.meanPrice = meanPrices?.length > 0 ? parseInt(meanPrices.reduce((a, b) => a + b) / meanPrices.length) : null
    commodity.maxPriceDelta = commodity.meanPrice ? commodity.bestImporters?.[0]?.sellPrice ?? 0 - commodity.bestExporters?.[0]?.buyPrice ?? 0 : null

    _saveReport(reportName, commodity, `commodities/${commodity.commodityName}`)

    // Pause generating commodity reports to reduce load on service
    if (DELAY_BETWEEN_GENERATING_STATS > 0) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_GENERATING_STATS))
    }
  }

  commodities = commodities
    // Filter out items not really being traded
    // i.e. no importers OR exporters with active supply/demand above threshold
    .filter(c => c.meanPrice !== null)
    // Sort by highest value
    .sort((a, b) => b.maxPriceDelta - a.maxPriceDelta)

  const report = {
    name: reportName,
    description: `Commodities traded within ${distance}Ly of the ${systemName} system with minimum supply/demand of at least ${minTradeVolume}T.`,
    system,
    commodities
  }

  _saveReport(report.name, report)

  return report
}

function _getBestCommodityExporters (commodityName, minVolume, system, distance) {
  ensureStationsDbAttached()

  // Performance: Use bounding box instead of expensive SQRT for initial filter
  // Then calculate exact distance only for remaining candidates
  return tradeDb.prepare(`
    SELECT c.*, s.stationName, s.stationType, s.systemName, s.systemX, s.systemY, s.systemZ,
      SQRT(POWER(s.systemX-@systemX,2)+POWER(s.systemY-@systemY,2)+POWER(s.systemZ-@systemZ,2)) as actualDistance
      FROM commodities c
      JOIN stationsDb.stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName
      AND c.stock >= @minVolume
      AND c.buyPrice > 0
      AND c.buyPrice < 999999
      -- Bounding box filter (fast) - removes 90%+ of stations
      AND s.systemX BETWEEN @minX AND @maxX
      AND s.systemY BETWEEN @minY AND @maxY
      AND s.systemZ BETWEEN @minZ AND @maxZ
      -- Exact distance check only on remaining candidates
      AND SQRT(POWER(s.systemX-@systemX,2)+POWER(s.systemY-@systemY,2)+POWER(s.systemZ-@systemZ,2)) < @distance
    ORDER BY c.buyPrice ASC
      LIMIT 10
    `).all({
    commodityName,
    minVolume,
    systemX: system.systemX,
    systemY: system.systemY,
    systemZ: system.systemZ,
    minX: system.systemX - distance,
    maxX: system.systemX + distance,
    minY: system.systemY - distance,
    maxY: system.systemY + distance,
    minZ: system.systemZ - distance,
    maxZ: system.systemZ + distance,
    distance
  })
}

function _getBestCommodityImporters (commodityName, minVolume, system, distance) {
  ensureStationsDbAttached()

  // Performance: Use bounding box instead of expensive SQRT for initial filter
  return tradeDb.prepare(`
    SELECT c.*, s.stationName, s.stationType, s.systemName, s.systemX, s.systemY, s.systemZ,
      SQRT(POWER(s.systemX-@systemX,2)+POWER(s.systemY-@systemY,2)+POWER(s.systemZ-@systemZ,2)) as actualDistance
      FROM commodities c
      JOIN stationsDb.stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName
      AND c.demand >= @minVolume
      AND c.sellPrice > 0
      AND c.sellPrice < 999999
      -- Bounding box filter (fast) - removes 90%+ of stations
      AND s.systemX BETWEEN @minX AND @maxX
      AND s.systemY BETWEEN @minY AND @maxY
      AND s.systemZ BETWEEN @minZ AND @maxZ
      -- Exact distance check only on remaining candidates
      AND SQRT(POWER(s.systemX-@systemX,2)+POWER(s.systemY-@systemY,2)+POWER(s.systemZ-@systemZ,2)) < @distance
    ORDER BY c.sellPrice DESC
      LIMIT 10
    `).all({
    commodityName,
    minVolume,
    systemX: system.systemX,
    systemY: system.systemY,
    systemZ: system.systemZ,
    minX: system.systemX - distance,
    maxX: system.systemX + distance,
    minY: system.systemY - distance,
    maxY: system.systemY + distance,
    minZ: system.systemZ - distance,
    maxZ: system.systemZ + distance,
    distance
  })
}

function _getAllCommodities () {
  return tradeDb
    .prepare(`
      SELECT DISTINCT(c.commodityName) 
        FROM commodities c 
      ORDER BY c.commodityName ASC
    `)
    .all()
}

function _getCommoditiesNearSystem (system, distance = DEFAULT_REPORT_DISTANCE) {
  ensureStationsDbAttached()
  
  if (!system || !system.systemX || !system.systemY || !system.systemZ) {
    return []
  }

  // Performance: Bounding box pre-filter before expensive distance calculation
  return tradeDb.prepare(`
    SELECT DISTINCT(c.commodityName)
      FROM commodities c
      JOIN stationsDb.stations s ON c.marketId = s.marketId
    WHERE (c.stock > 0 OR c.demand > 0)
      -- Bounding box filter (fast)
      AND s.systemX BETWEEN @minX AND @maxX
      AND s.systemY BETWEEN @minY AND @maxY
      AND s.systemZ BETWEEN @minZ AND @maxZ
      -- Exact distance check
      AND SQRT(POWER(s.systemX-@systemX,2)+POWER(s.systemY-@systemY,2)+POWER(s.systemZ-@systemZ,2)) < @distance
    ORDER BY c.commodityName ASC
  `).all({
    systemX: system.systemX,
    systemY: system.systemY,
    systemZ: system.systemZ,
    minX: system.systemX - distance,
    maxX: system.systemX + distance,
    minY: system.systemY - distance,
    maxY: system.systemY + distance,
    minZ: system.systemZ - distance,
    maxZ: system.systemZ + distance,
    distance
  })
}

function _saveReport (reportName, reportData, dir = null) {
  const baseDir = dir ? path.join(EDDATA_CACHE_DIR, dir) : EDDATA_CACHE_DIR

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }

  reportData.timestamp = new Date().toISOString()
  const pathToFile = path.join(baseDir, `${reportName}.json`)
  fs.writeFileSync(pathToFile, JSON.stringify(reportData, null, 2))
}

module.exports = {
  initializeDatabases,
  updateCommodityStats,
  updateCommodityReport
}
