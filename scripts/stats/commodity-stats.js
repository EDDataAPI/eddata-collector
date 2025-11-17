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

  // Generate commodity ticker with hot trading opportunities
  console.log('Generating commodity ticker...')
  console.time('Generate commodity ticker')
  const tickerPath = path.join(EDDATA_CACHE_DIR, 'commodity-ticker.json')

  // Find top trading opportunities by profit margin
  // Uses snapshot data to find best current buy/sell opportunities
  const hotTrades = tradeDb.prepare(`
    SELECT 
      buy.commodityName,
      buy.marketId as buyMarketId,
      buy.buyPrice,
      buy.stock,
      sell.marketId as sellMarketId,
      sell.sellPrice,
      sell.demand,
      (sell.sellPrice - buy.buyPrice) as profit,
      CAST(((sell.sellPrice - buy.buyPrice) * 100.0 / buy.buyPrice) as INT) as profitPercent,
      buy.updatedAt as buyUpdatedAt,
      sell.updatedAt as sellUpdatedAt
    FROM commodities buy
    JOIN commodities sell ON buy.commodityName = sell.commodityName
    WHERE buy.stock > 100
      AND buy.buyPrice > 0
      AND buy.buyPrice < 999999
      AND sell.demand > 100
      AND sell.sellPrice > 0
      AND sell.sellPrice < 999999
      AND sell.sellPrice > buy.buyPrice
      AND buy.marketId != sell.marketId
    ORDER BY profit DESC
    LIMIT 20
  `).all()

  // Find commodities with highest current prices (luxury/rare items indicator)
  const highValueCommodities = tradeDb.prepare(`
    SELECT 
      commodityName,
      MAX(sellPrice) as maxPrice,
      COUNT(DISTINCT marketId) as marketCount,
      SUM(demand) as totalDemand
    FROM commodities
    WHERE sellPrice > 0 
      AND sellPrice < 999999
      AND demand > 0
    GROUP BY commodityName
    ORDER BY maxPrice DESC
    LIMIT 10
  `).all()

  // Find commodities with most trading activity (updated recently)
  const { getISOTimestamp } = require('../../lib/utils/dates')
  const activeCommodities = tradeDb.prepare(`
    SELECT 
      commodityName,
      COUNT(DISTINCT marketId) as activeMarkets,
      SUM(stock) as totalStock,
      SUM(demand) as totalDemand,
      AVG(CASE WHEN buyPrice > 0 AND buyPrice < 999999 THEN buyPrice END) as avgBuyPrice,
      AVG(CASE WHEN sellPrice > 0 AND sellPrice < 999999 THEN sellPrice END) as avgSellPrice
    FROM commodities
    WHERE updatedAt > @recentTimestamp
    GROUP BY commodityName
    HAVING activeMarkets > 5
    ORDER BY activeMarkets DESC
    LIMIT 10
  `).all({
    recentTimestamp: getISOTimestamp(-1) // Last 24 hours
  })

  const ticker = {
    hotTrades: hotTrades.map(t => ({
      commodity: t.commodityName,
      profit: t.profit,
      profitPercent: t.profitPercent,
      buy: {
        marketId: t.buyMarketId,
        price: t.buyPrice,
        stock: t.stock
      },
      sell: {
        marketId: t.sellMarketId,
        price: t.sellPrice,
        demand: t.demand
      }
    })),
    highValue: highValueCommodities.map(c => ({
      commodity: c.commodityName,
      maxPrice: c.maxPrice,
      markets: c.marketCount,
      demand: c.totalDemand
    })),
    mostActive: activeCommodities.map(c => ({
      commodity: c.commodityName,
      activeMarkets: c.activeMarkets,
      avgBuyPrice: Math.round(c.avgBuyPrice || 0),
      avgSellPrice: Math.round(c.avgSellPrice || 0),
      totalStock: c.totalStock,
      totalDemand: c.totalDemand
    })),
    timestamp: new Date().toISOString()
  }

  fs.writeFileSync(tickerPath, JSON.stringify(ticker, null, 2))
  console.timeEnd('Generate commodity ticker')

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
