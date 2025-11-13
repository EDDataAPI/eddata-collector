const path = require('path')
const fs = require('fs')
const SqlLiteDatabase = require('better-sqlite3')
const { EDDATA_SYSTEMS_DB } = require('../consts')

let database = null

function getDatabase (options = {}) {
  if (!database) {
    // Ensure directory exists before creating database
    const dbDir = path.dirname(EDDATA_SYSTEMS_DB)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    database = new SqlLiteDatabase(EDDATA_SYSTEMS_DB, options)
  }
  return database
}

function getDatabaseName () {
  return path.basename(EDDATA_SYSTEMS_DB)
}

function ensureTables () {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS systems (
      systemAddress INT PRIMARY KEY,
      systemName TEXT COLLATE NOCASE,
      systemX REAL,
      systemY REAL,
      systemZ REAL,
      systemSector STRING,
      updatedAt TEXT
    )
  `)
}

function ensureIndexes () {
  getDatabase().exec('CREATE INDEX IF NOT EXISTS systems_systemName_collate ON systems (systemName COLLATE NOCASE)')
  // TODO rename index from systemSector to systems_systemSector
  getDatabase().exec('CREATE INDEX IF NOT EXISTS systemSector ON systems (systemSector)')
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
