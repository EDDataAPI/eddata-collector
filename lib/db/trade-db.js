const path = require('path')
const SqlLiteDatabase = require('better-sqlite3')
const { EDDATA_TRADE_DB } = require('../consts')

let database = null

function getDatabase (options = {}) {
  if (!database) database = new SqlLiteDatabase(EDDATA_TRADE_DB, options)
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
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
