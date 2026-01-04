const path = require('path')
const fs = require('fs')
const SqlLiteDatabase = require('better-sqlite3')
const { EDDATA_TRADE_DB } = require('../consts')

let database = null

function getDatabase (options = {}) {
  if (!database) {
    // Ensure directory exists before creating database
    const dbDir = path.dirname(EDDATA_TRADE_DB)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    database = new SqlLiteDatabase(EDDATA_TRADE_DB, options)
  }
  return database
}

function getDatabaseName () {
  return path.basename(EDDATA_TRADE_DB)
}

function ensureTables () {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS commodities (
      commodityName TEXT,
      marketId INT,
      buyPrice INT,
      demand INT,
      demandBracket INT,
      meanPrice INT,
      sellPrice INT,
      stock INT,
      stockBracket INT,
      updatedAt TEXT,
      updatedAtDay TEXT,
      PRIMARY KEY(commodityName, marketId)
    )
  `)
}

function ensureIndexes () {
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_commodityName ON commodities (commodityName)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_marketId ON commodities (marketId)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_commodityName_updatedAtDay ON commodities (commodityName, updatedAtDay)')

  // Composite indexes for common query patterns
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_updated_recent ON commodities (updatedAtDay DESC, commodityName)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_price_lookup ON commodities (commodityName, buyPrice, sellPrice) WHERE buyPrice > 0')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_stock_demand ON commodities (commodityName, stock, demand) WHERE stock > 0 OR demand > 0')

  // Covering index for ticker queries (includes all commonly needed columns)
  getDatabase().exec(`CREATE INDEX IF NOT EXISTS commodities_ticker_covering ON commodities 
    (commodityName, buyPrice, sellPrice, stock, demand, marketId, updatedAt) 
    WHERE buyPrice > 0 AND sellPrice > 0`)

  // Run ANALYZE to update query planner statistics for better index usage
  getDatabase().exec('ANALYZE')
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
