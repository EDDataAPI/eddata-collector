const path = require('path')
const SqlLiteDatabase = require('better-sqlite3')
const { ARDENT_SYSTEMS_DB } = require('../consts')

let database = null

function getDatabase (options = {}) {
  if (!database) database = new SqlLiteDatabase(ARDENT_SYSTEMS_DB, options)
  return database
}

function getDatabaseName () {
  return path.basename(ARDENT_SYSTEMS_DB)
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
