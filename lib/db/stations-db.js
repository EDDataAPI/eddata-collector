const path = require('path')
const fs = require('fs')
const SqlLiteDatabase = require('better-sqlite3')
const { EDDATA_STATIONS_DB } = require('../consts')

let database = null

function getDatabase (options = {}) {
  if (!database) {
    // Ensure directory exists before creating database
    const dbDir = path.dirname(EDDATA_STATIONS_DB)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    database = new SqlLiteDatabase(EDDATA_STATIONS_DB, options)
  }
  return database
}

function getDatabaseName () {
  return path.basename(EDDATA_STATIONS_DB)
}

// TODO Add 'prohibited' (text, array of prohibited goods)
// TODO Add 'carrierDockingAccess'
function ensureTables () {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS stations (
      marketId INT PRIMARY KEY,
      stationName TEXT COLLATE NOCASE,
      distanceToArrival REAL,
      stationType TEXT COLLATE NOCASE,
      allegiance TEXT COLLATE NOCASE,
      government TEXT COLLATE NOCASE,
      controllingFaction TEXT COLLATE NOCASE,
      primaryEconomy TEXT,
      secondaryEconomy TEXT,
      shipyard INT,
      outfitting INT,
      blackMarket INT,
      contacts INT,
      crewLounge INT,
      interstellarFactors INT,
      materialTrader INT,
      missions INT,
      refuel INT,
      repair INT,
      restock INT,
      searchAndRescue INT,
      technologyBroker INT,
      tuning INT,
      universalCartographics INT,
      engineer INT,
      frontlineSolutions INT,
      apexInterstellar INT,
      vistaGenomics INT,
      pioneerSupplies INT,
      bartender INT,
      systemAddress INT,
      systemName TEXT COLLATE NOCASE,
      systemX REAL,
      systemY REAL,
      systemZ REAL,
      bodyId INT,
      bodyName TEXT COLLATE NOCASE,
      latitude REAL,
      longitude REAL,
      maxLandingPadSize INT,
      updatedAt TEXT
    )
  `)
}

function ensureIndexes () {
  getDatabase().exec('CREATE INDEX IF NOT EXISTS stations_stationName_collate ON stations (stationName COLLATE NOCASE)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS stations_systemName_collate ON stations (systemName COLLATE NOCASE)')

  // Experimental - will see if it improves performance times in product for
  // queries relating to getting all stations within a system for a specific
  // commodity.
  getDatabase().exec('CREATE INDEX IF NOT EXISTS stations_systemAddress ON stations (systemAddress)')
}

function migrateSchema () {
  const db = getDatabase()

  // Get current table structure
  const tableInfo = db.prepare('PRAGMA table_info(stations)').all()
  const existingColumns = new Set(tableInfo.map(col => col.name))

  // Define all expected columns from the schema
  const expectedColumns = [
    { name: 'marketId', type: 'INT', default: null },
    { name: 'stationName', type: 'TEXT', default: null },
    { name: 'distanceToArrival', type: 'REAL', default: null },
    { name: 'stationType', type: 'TEXT', default: null },
    { name: 'allegiance', type: 'TEXT', default: null },
    { name: 'government', type: 'TEXT', default: null },
    { name: 'controllingFaction', type: 'TEXT', default: null },
    { name: 'primaryEconomy', type: 'TEXT', default: null },
    { name: 'secondaryEconomy', type: 'TEXT', default: null },
    { name: 'shipyard', type: 'INT', default: 0 },
    { name: 'outfitting', type: 'INT', default: 0 },
    { name: 'blackMarket', type: 'INT', default: 0 },
    { name: 'contacts', type: 'INT', default: 0 },
    { name: 'crewLounge', type: 'INT', default: 0 },
    { name: 'interstellarFactors', type: 'INT', default: 0 },
    { name: 'materialTrader', type: 'INT', default: 0 },
    { name: 'missions', type: 'INT', default: 0 },
    { name: 'refuel', type: 'INT', default: 0 },
    { name: 'repair', type: 'INT', default: 0 },
    { name: 'restock', type: 'INT', default: 0 },
    { name: 'searchAndRescue', type: 'INT', default: 0 },
    { name: 'technologyBroker', type: 'INT', default: 0 },
    { name: 'tuning', type: 'INT', default: 0 },
    { name: 'universalCartographics', type: 'INT', default: 0 },
    { name: 'engineer', type: 'INT', default: 0 },
    { name: 'frontlineSolutions', type: 'INT', default: 0 },
    { name: 'apexInterstellar', type: 'INT', default: 0 },
    { name: 'vistaGenomics', type: 'INT', default: 0 },
    { name: 'pioneerSupplies', type: 'INT', default: 0 },
    { name: 'bartender', type: 'INT', default: 0 },
    { name: 'systemAddress', type: 'INT', default: null },
    { name: 'systemName', type: 'TEXT', default: null },
    { name: 'systemX', type: 'REAL', default: null },
    { name: 'systemY', type: 'REAL', default: null },
    { name: 'systemZ', type: 'REAL', default: null },
    { name: 'bodyId', type: 'INT', default: null },
    { name: 'bodyName', type: 'TEXT', default: null },
    { name: 'latitude', type: 'REAL', default: null },
    { name: 'longitude', type: 'REAL', default: null },
    { name: 'maxLandingPadSize', type: 'INT', default: null },
    { name: 'updatedAt', type: 'TEXT', default: null }
  ]

  // Find missing columns
  const missingColumns = expectedColumns.filter(col => !existingColumns.has(col.name))

  // Add missing columns
  if (missingColumns.length > 0) {
    console.log(`[stations.db] Found ${missingColumns.length} missing column(s), applying migrations...`)

    missingColumns.forEach(col => {
      const defaultClause = col.default !== null ? ` DEFAULT ${col.default}` : ''
      const sql = `ALTER TABLE stations ADD COLUMN ${col.name} ${col.type}${defaultClause}`
      console.log(`[stations.db] Adding column: ${col.name}`)
      db.exec(sql)
    })

    console.log('[stations.db] Schema migration completed successfully')
  }
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes,
  migrateSchema
}
