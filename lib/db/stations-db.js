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

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
