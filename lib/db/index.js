const SystemsDatabase = require('./systems-db')
const LocationsDatabase = require('./locations-db')
const StationsDatabase = require('./stations-db')
const TradeDatabase = require('./trade-db')

// A generous timeout of 5 seconds helps avoid any errors in the rare case there
// is a write lock held by another process - e.g. a maintenance/stats script
const WRITE_BUSY_TIMEOUT_IN_MS = 5000

const [
  systemsDb,
  locationsDb,
  stationsDb,
  tradeDb
] = [
  SystemsDatabase,
  LocationsDatabase,
  StationsDatabase,
  TradeDatabase
].map(database => {
  const databaseName = database.getDatabaseName()

  console.log(`[${databaseName}] Initalizing database`)
  const db = database.getDatabase({
    // verbose: console.log
  })

  console.log(`[${databaseName}] Setting pragma options on database`)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma(`busy_timeout = ${WRITE_BUSY_TIMEOUT_IN_MS}`)

  console.log(`[${databaseName}] Ensuring tables exist and indexes present`)
  database.ensureTables()
  database.ensureIndexes()

  console.log(`[${databaseName}] Database initalized`)
  return db
})

const closeAllDatabaseConnections = () => {
  locationsDb.close()
  stationsDb.close()
  tradeDb.close()
  systemsDb.close()
}

module.exports = {
  systemsDb,
  locationsDb,
  stationsDb,
  tradeDb,
  closeAllDatabaseConnections
}
