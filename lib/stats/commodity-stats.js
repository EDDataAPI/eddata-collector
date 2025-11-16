const fs = require('fs')
const path = require('path')
const { EDDATA_CACHE_DIR, EDDATA_STATIONS_DB } = require('../consts')
// Import stationsDb to ensure stations table is initialized (required for JOINs in queries)
const { tradeDb, systemsDb, stationsDb } = require('../db') // eslint-disable-line no-unused-vars
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

// Attach stations database to trade database for cross-database queries
function ensureStationsDbAttached () {
  try {
    tradeDb.exec(`ATTACH DATABASE '${EDDATA_STATIONS_DB}' AS stationsDb`)
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

  const statements = {
    maxBuyPrice: tradeDb.prepare(`
      SELECT MAX(c.buyPrice) as maxBuyPrice
        FROM commodities c
      WHERE c.commodityName = @commodityName COLLATE NOCASE
        AND c.stock >= 1
        AND c.buyPrice > 0
        AND c.buyPrice < 999999
      LIMIT 1
    `),
    minBuyPrice: tradeDb.prepare(`
      SELECT MIN(c.buyPrice) as minBuyPrice
        FROM commodities c
      WHERE c.commodityName = @commodityName COLLATE NOCASE
        AND c.stock >= 1
        AND c.buyPrice > 0
        AND c.buyPrice < 999999
      LIMIT 1
    `),
    avgBuyPrice: tradeDb.prepare(`
      SELECT CAST(AVG(c.buyPrice) as INT) as avgBuyPrice
        FROM commodities c
      WHERE c.commodityName = @commodityName COLLATE NOCASE
        AND c.stock >= 1
        AND c.buyPrice > 0
        AND c.buyPrice < 999999
      LIMIT 1
    `),
    totalStock: tradeDb.prepare(`
      SELECT SUM(c.stock) as totalStock
        FROM commodities c
      WHERE c.commodityName = @commodityName COLLATE NOCASE
      LIMIT 1
    `),
    maxSellPrice: tradeDb.prepare(`
      SELECT MAX(c.sellPrice) as maxSellPrice
        FROM commodities c
      WHERE c.commodityName = @commodityName COLLATE NOCASE
        AND c.demand >= 1
        AND c.sellPrice > 0
        AND c.sellPrice < 999999
      LIMIT 1
    `),
    minSellPrice: tradeDb.prepare(`
      SELECT MIN(c.sellPrice) as minSellPrice
        FROM commodities c
      WHERE c.commodityName = @commodityName COLLATE NOCASE
        AND c.demand >= 1
        AND c.sellPrice > 0
        AND c.sellPrice < 999999
      LIMIT 1
    `),
    avgSellPrice: tradeDb.prepare(`
      SELECT CAST(AVG(c.sellPrice) as INT) as avgSellPrice
        FROM commodities c
      WHERE c.commodityName = @commodityName COLLATE NOCASE
        AND c.demand >= 1
        AND c.sellPrice > 0
        AND c.sellPrice < 999999
      LIMIT 1
    `),
    totalDemand: tradeDb.prepare(`
      SELECT SUM(c.demand) as totalDemand
        FROM commodities c
      WHERE c.commodityName = @commodityName COLLATE NOCASE
      LIMIT 1
    `)
  }

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
      const minBuyPrice = statements.minBuyPrice.get({ commodityName }).minBuyPrice
      const minSellPrice = statements.minSellPrice.get({ commodityName }).minSellPrice
      const minPrice = minBuyPrice ?? minSellPrice

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
        console.log('Fetching minBuyPrice...')
      }
      commodity.minBuyPrice = statements.minBuyPrice.get({ commodityName }).minBuyPrice
      commodity.maxBuyPrice = statements.maxBuyPrice.get({ commodityName }).maxBuyPrice
      commodity.avgBuyPrice = statements.avgBuyPrice.get({ commodityName }).avgBuyPrice
      commodity.totalStock = statements.totalStock.get({ commodityName }).totalStock
      commodity.minSellPrice = statements.minSellPrice.get({ commodityName }).minSellPrice
      commodity.maxSellPrice = statements.maxSellPrice.get({ commodityName }).maxSellPrice
      commodity.avgSellPrice = statements.avgSellPrice.get({ commodityName }).avgSellPrice
      commodity.totalDemand = statements.totalDemand.get({ commodityName }).totalDemand
    }

    // Save standalone stats report just for this commodity
    _saveReport(commodity.commodityName, commodity, `commodities/${commodity.commodityName}`)

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
  return tradeDb.prepare(`
    SELECT c.*, s.stationName, s.stationType, s.systemName, s.systemX, s.systemY, s.systemZ
      FROM commodities c
      JOIN stationsDb.stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.stock >= @minVolume
      AND SQRT(POWER(s.systemX-@systemX,2)+POWER(s.systemY-@systemY,2)+POWER(s.systemZ-@systemZ,2)) < @distance
    ORDER BY c.buyPrice ASC
      LIMIT 10
    `).all({
    commodityName,
    minVolume,
    systemX: system.systemX,
    systemY: system.systemY,
    systemZ: system.systemZ,
    distance
  })
}

function _getBestCommodityImporters (commodityName, minVolume, system, distance) {
  ensureStationsDbAttached()
  return tradeDb.prepare(`
    SELECT c.*, s.stationName, s.stationType, s.systemName, s.systemX, s.systemY, s.systemZ
      FROM commodities c
      JOIN stationsDb.stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.demand >= @minVolume
      AND SQRT(POWER(s.systemX-@systemX,2)+POWER(s.systemY-@systemY,2)+POWER(s.systemZ-@systemZ,2)) < @distance
    ORDER BY c.sellPrice DESC
      LIMIT 10
    `).all({
    commodityName,
    minVolume,
    systemX: system.systemX,
    systemY: system.systemY,
    systemZ: system.systemZ,
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
  return tradeDb.prepare(`
    SELECT DISTINCT(c.commodityName)
      FROM commodities c
      JOIN stationsDb.stations s ON c.marketId = s.marketId
    WHERE SQRT(POWER(s.systemX-@systemX,2)+POWER(s.systemY-@systemY,2)+POWER(s.systemZ-@systemZ,2)) < @distance
      AND (c.stock > 0 OR c.demand > 0)
    ORDER BY c.commodityName ASC
  `).all({
    systemX: system?.systemX,
    systemY: system?.systemY,
    systemZ: system?.systemZ,
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
  updateCommodityStats,
  updateCommodityReport
}
