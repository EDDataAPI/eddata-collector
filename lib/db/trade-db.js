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
  const db = getDatabase()
  
  // Essential indexes (fast, always create)
  db.exec('CREATE INDEX IF NOT EXISTS commodities_commodityName ON commodities (commodityName)')
  db.exec('CREATE INDEX IF NOT EXISTS commodities_marketId ON commodities (marketId)')
  db.exec('CREATE INDEX IF NOT EXISTS commodities_commodityName_updatedAtDay ON commodities (commodityName, updatedAtDay)')

  // Performance: Skip expensive index creation on startup for large databases
  // New indexes will be created in background during first stats run
  // This prevents 5-10 minute startup delays on first run with new indexes
  const skipExpensiveIndexes = process.env.SKIP_EXPENSIVE_INDEXES === 'true'
  
  if (!skipExpensiveIndexes) {
    // Check if indexes already exist before attempting to create (faster)
    const existingIndexes = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='index' AND tbl_name='commodities'
    `).all().map(row => row.name)
    
    // Composite indexes for common query patterns (can take 1-5 min on large DB)
    if (!existingIndexes.includes('commodities_updated_recent')) {
      console.log('  Creating commodities_updated_recent index (may take 1-2 minutes)...')
      db.exec('CREATE INDEX commodities_updated_recent ON commodities (updatedAtDay DESC, commodityName)')
    }
    
    if (!existingIndexes.includes('commodities_price_lookup')) {
      console.log('  Creating commodities_price_lookup index (may take 1-2 minutes)...')
      db.exec('CREATE INDEX commodities_price_lookup ON commodities (commodityName, buyPrice, sellPrice) WHERE buyPrice > 0')
    }
    
    if (!existingIndexes.includes('commodities_stock_demand')) {
      console.log('  Creating commodities_stock_demand index (may take 1-2 minutes)...')
      db.exec('CREATE INDEX commodities_stock_demand ON commodities (commodityName, stock, demand) WHERE stock > 0 OR demand > 0')
    }
    
    // Covering index for ticker queries (heaviest - can take 3-5 min on large DB)
    if (!existingIndexes.includes('commodities_ticker_covering')) {
      console.log('  Creating commodities_ticker_covering index (may take 3-5 minutes)...')
      db.exec(`CREATE INDEX commodities_ticker_covering ON commodities 
        (commodityName, buyPrice, sellPrice, stock, demand, marketId, updatedAt) 
        WHERE buyPrice > 0 AND sellPrice > 0`)
    }
  } else {
    console.log('  Skipping expensive composite indexes (SKIP_EXPENSIVE_INDEXES=true)')
  }

  // Run ANALYZE to update query planner statistics for better index usage
  db.exec('ANALYZE')
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
