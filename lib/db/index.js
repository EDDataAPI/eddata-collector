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

  // Performance optimizations for very large databases (trade.db is 7.4GB+)
  // Server has 8GB RAM total, so cache must be realistic
  db.pragma('cache_size = -2000000') // 2GB cache (27% of 7.4GB DB)
  db.pragma('temp_store = MEMORY') // Temp tables in RAM
  db.pragma('mmap_size = 8589934592') // 8GB Memory-Mapped I/O (OS handles swapping)
  db.pragma('page_size = 8192') // Larger pages for better throughput

  console.log(`[${databaseName}] Ensuring tables exist and indexes present`)
  database.ensureTables()
  database.ensureIndexes()

  // Run migrations if available
  if (database.migrateSchema) {
    console.log(`[${databaseName}] Running schema migrations`)
    database.migrateSchema()
  }

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
