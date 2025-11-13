const fs = require('fs')
const path = require('path')
const { ARDENT_CACHE_DIR } = require('../consts')
const { tradeDb, systemsDb } = require('../db')
const arrayOfRareCommodities = require('../data/rare-commodities.json')

const rareCommodities = {}
arrayOfRareCommodities.forEach(c => rareCommodities[c.symbol.toLocaleLowerCase()] = c)

const DELAY_BETWEEN_GENERATING_STATS = 0
const DEFAULT_REPORT_DISTANCE = 500
const DEFAULT_MINIMUM_TRADE_VOLUME = 1000

// Very rough estimate of how much more valuable rare items are when sold far away
// Is not very accurate for higher value rare goods, or items sold during special
// occations, but the raw market data we get doesn't explicitly list those prices
// (although I could build a database of those values from other sources)
const RARE_GOODS_VALUE_INCREASE = 16000

async function updateCommodityStats () {
  // Updated queries to exclude Fleet Carrier data by joining with stations table
  const getMaxBuyPriceStmt = tradeDb.prepare(`
    SELECT MAX(c.buyPrice) as maxBuyPrice
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.stock >= 1
      AND s.stationType != 'Fleet Carrier'
    LIMIT 1
  `)
  const getMinBuyPriceStmt = tradeDb.prepare(`
    SELECT MIN(c.buyPrice) as minBuyPrice
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.stock >= 1
      AND s.stationType != 'Fleet Carrier'
    LIMIT 1
  `)
  const getAvgBuyPriceStmt = tradeDb.prepare(`
    SELECT CAST(AVG(c.buyPrice) as INT) as avgBuyPrice
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.stock >= 1
      AND s.stationType != 'Fleet Carrier'
    LIMIT 1
  `)
  const getTotalStockStmt = tradeDb.prepare(`
    SELECT SUM(c.stock) as totalStock
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND s.stationType != 'Fleet Carrier'
    LIMIT 1
  `)
  const getMaxSellPriceStmt = tradeDb.prepare(`
    SELECT MAX(c.sellPrice) as maxSellPrice
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.demand >= 1
      AND s.stationType != 'Fleet Carrier'
    LIMIT 1
  `)
  const getMinSellPriceStmt = tradeDb.prepare(`
    SELECT MIN(c.sellPrice) as minSellPrice
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.demand >= 1
      AND s.stationType != 'Fleet Carrier'
    LIMIT 1
  `)
  const getAvgSellPriceStmt = tradeDb.prepare(`
    SELECT CAST(AVG(c.sellPrice) as INT) as avgSellPrice
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.demand >= 1
      AND s.stationType != 'Fleet Carrier'
    LIMIT 1
  `)
  const getTotalDemandStmt = tradeDb.prepare(`
    SELECT SUM(c.demand) as totalDemand
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND s.stationType != 'Fleet Carrier'
    LIMIT 1
  `)
  const commodities = _getAllCommodities()
  for (const i in commodities) {
    const commodity = commodities[i]
    const { commodityName } = commodity

    if (rareCommodities[commodityName.toLowerCase()]) {
      commodity.rare = true
      commodity.rareMarketId = parseInt(rareCommodities[commodityName.toLowerCase()].market_id)
      commodity.rareMaxCount = rareCommodities[commodityName.toLowerCase()]?.count ?? null

      // Sometimes we have a record of one but not the other (but they are always the same)
      // This could just be hard coded but I don't have a dataset to hand.
      const minBuyPrice = getMinBuyPriceStmt.get({ commodityName }).minBuyPrice
      const minSellPrice = getMinSellPriceStmt.get({ commodityName }).minSellPrice
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
      commodity.minBuyPrice = getMinBuyPriceStmt.get({ commodityName }).minBuyPrice
      commodity.maxBuyPrice = getMaxBuyPriceStmt.get({ commodityName }).maxBuyPrice
      commodity.avgBuyPrice = getAvgBuyPriceStmt.get({ commodityName }).avgBuyPrice
      commodity.totalStock = getTotalStockStmt.get({ commodityName }).totalStock
      commodity.minSellPrice = getMinSellPriceStmt.get({ commodityName }).minSellPrice
      commodity.maxSellPrice = getMaxSellPriceStmt.get({ commodityName }).maxSellPrice
      commodity.avgSellPrice = getAvgSellPriceStmt.get({ commodityName }).avgSellPrice
      commodity.totalDemand = getTotalDemandStmt.get({ commodityName }).totalDemand
    }
    // Save standalone stats report just for for this commodity
    _saveReport(commodity.commodityName, commodity, `commodities/${commodity.commodityName}`)

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
  if (!reportName) reportName = `${systemName}-${distance}Ly-${minTradeVolume}T`
  const system = systemsDb.prepare('SELECT * FROM systems WHERE systemName = @systemName COLLATE NOCASE').get({ systemName })
  let commodities = _getCommoditiesNearSystem(system, distance)
  for (const i in commodities) {
    const commodity = commodities[i]
    commodity.bestExporters = _getBestCommodityExporters(commodity.commodityName, minTradeVolume, system, distance)
    commodity.bestImporters = _getBestCommodityImporters(commodity.commodityName, minTradeVolume, system, distance)

    const meanPrices = [
      ...commodity.bestImporters?.map(c => c.meanPrice) ?? [],
      ...commodity.bestExporters?.map(c => c.meanPrice) ?? []
    ]
    commodity.meanPrice = meanPrices?.length > 0 ? parseInt(meanPrices.reduce((a, b) => a + b) / meanPrices.length) : null
    commodity.maxPriceDelta = commodity.meanPrice ? commodity.bestImporters?.[0]?.sellPrice ?? 0 - commodity.bestExporters?.[0]?.buyPrice ?? 0 : null

    _saveReport(reportName, commodities[i], `commodities/${commodity.commodityName}`)

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
  return tradeDb.prepare(`
    SELECT c.*, s.stationName, s.stationType, s.systemName, s.systemX, s.systemY, s.systemZ
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.stock >= @minVolume
      AND s.stationType != 'Fleet Carrier'
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
  return tradeDb.prepare(`
    SELECT c.*, s.stationName, s.stationType, s.systemName, s.systemX, s.systemY, s.systemZ
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.demand >= @minVolume
      AND s.stationType != 'Fleet Carrier'
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
        JOIN stations s ON c.marketId = s.marketId 
      WHERE s.stationType != 'Fleet Carrier'
      ORDER BY c.commodityName ASC
    `)
    .all()
}

function _getCommoditiesNearSystem (system, distance = DEFAULT_REPORT_DISTANCE) {
  return tradeDb.prepare(`
    SELECT DISTINCT(c.commodityName)
      FROM commodities c
      JOIN stations s ON c.marketId = s.marketId
    WHERE SQRT(POWER(s.systemX-@systemX,2)+POWER(s.systemY-@systemY,2)+POWER(s.systemZ-@systemZ,2)) < @distance
      AND (c.stock > 0 OR c.demand > 0)
      AND s.stationType != 'Fleet Carrier'
    ORDER BY c.commodityName ASC
  `).all({
    systemX: system?.systemX,
    systemY: system?.systemY,
    systemZ: system?.systemZ,
    distance
  })
}

function _saveReport (reportName, reportData, dir = null) {
  if (dir) {
    const commodityDir = path.join(ARDENT_CACHE_DIR, dir)
    if (!fs.existsSync(commodityDir)) { fs.mkdirSync(commodityDir, { recursive: true }) }
    reportData.timestamp = new Date().toISOString()
    const pathToFile = path.join(commodityDir, `${reportName}.json`)
    fs.writeFileSync(pathToFile, JSON.stringify(reportData, null, 2))
  } else {
    if (!fs.existsSync(ARDENT_CACHE_DIR)) { fs.mkdirSync(ARDENT_CACHE_DIR, { recursive: true }) }
    reportData.timestamp = new Date().toISOString()
    const pathToFile = path.join(ARDENT_CACHE_DIR, `${reportName}.json`)
    fs.writeFileSync(pathToFile, JSON.stringify(reportData, null, 2))
  }
}

module.exports = {
  updateCommodityStats,
  updateCommodityReport
}
