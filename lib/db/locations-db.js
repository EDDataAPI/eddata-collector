const path = require('path')
const fs = require('fs')
const SqlLiteDatabase = require('better-sqlite3')
const { EDDATA_LOCATIONS_DB } = require('../consts')

let database = null

function getDatabase (options = {}) {
  if (!database) {
    // Ensure directory exists before creating database
    const dbDir = path.dirname(EDDATA_LOCATIONS_DB)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    database = new SqlLiteDatabase(EDDATA_LOCATIONS_DB, options)
  }
  return database
}

function getDatabaseName () {
  return path.basename(EDDATA_LOCATIONS_DB)
}

function ensureTables () {
  // locationId is a shake256 hash of `${systemAddress}/${locationName}/${bodyId}/${latitude}/${longitude}`
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS locations (
      locationId TEXT PRIMARY KEY,
      locationName TEXT COLLATE NOCASE,
      systemAddress INT,
      systemName TEXT COLLATE NOCASE,
      systemX REAL,
      systemY REAL,
      systemZ REAL,
      bodyId INT,
      bodyName TEXT COLLATE NOCASE,
      latitude REAL,
      longitude REAL,
      updatedAt TEXT
    )
  `)
}

function ensureIndexes () {
  getDatabase().exec('CREATE INDEX IF NOT EXISTS locations_locationName_collate ON locations (locationName COLLATE NOCASE)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS locations_systemName_collate ON locations (systemName COLLATE NOCASE)')
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
