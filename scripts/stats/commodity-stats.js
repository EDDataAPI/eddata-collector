const {
  updateCommodityStats,
  updateCommodityReport
} = require('../../lib/stats/commodity-stats')
const fs = require('fs')
const path = require('path')
const { EDDATA_CACHE_DIR } = require('../../lib/consts')

;(async () => {
  console.log('Updating stats for commodities…')

  // Fixed: The commodity stats now exclude Fleet Carrier data and use proper joins
  console.time('Update stats for commodities')
  const commodities = await updateCommodityStats()
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
})()
