const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../lib/db')
const { getISOTimestamp } = require('../lib/utils/dates')
const {
  TRADE_DATA_MAX_AGE_DAYS,
  RESCUE_SHIP_MAX_AGE_DAYS,
  FLEET_CARRIER_MAX_AGE_DAYS
} = require('../lib/consts')

// Using 'VACUUM' can be very slow and use up to 2x the disk space when running.
//
// It is superior at optimization than relying on the optimize command, but in
// practice it is slow and can only be used when a database is not otherwise in
// use. It is typically faster (and involves less downtime) to create a new
// backup (which will use VACUUM INTO, which is faster) and then restore from
// that backup, as the backup created in VACUUM INTO will be fully optimized.
const FULL_VACUUM = false

// ********* OPTIMIZE LOCATIONS DB *********
console.time('Optimize locationsDb')
optimize(locationsDb)
locationsDb.close()
console.timeEnd('Optimize locationsDb')

// ********* OPTIMIZE STATIONS DB *********
console.time('Optimize stationsDb')

// Purge data for Rescue Ships that have not been confirmed as active recently
stationsDb.exec(`
  DELETE FROM stations WHERE stations.stationType = 'MegaShip' AND stations.stationName LIKE 'Rescue Ship - %' AND updatedAt <= '${getISOTimestamp(`-${RESCUE_SHIP_MAX_AGE_DAYS}`)}'
`)
// Purge data for Fleet Carriers that have not been confirmed as active recently
stationsDb.exec(`
  DELETE FROM stations WHERE stations.stationType = 'FleetCarrier' AND updatedAt <= '${getISOTimestamp(`-${FLEET_CARRIER_MAX_AGE_DAYS}`)}'
`)
// Purge GameplayPOI stations. These are the type given to non-dockable
// installations - once constucted they are no longer valid markets/stations.
stationsDb.exec(`
  DELETE FROM stations 
    WHERE stations.stationType = 'GameplayPOI'
       OR stations.stationType = 'DockablePlanetStation'
`)
optimize(stationsDb)
stationsDb.close()
console.timeEnd('Optimize stationsDb')

// ********* OPTIMIZE TRADE DB *********
// The trade DB is very large and is modified frequently (multiple updates a second)
// It is stored on disk but typically needs to be fully loaded into RAM to be performant
console.time('Optimize tradeDb')

// Delete commodity data older than TRADE_DATA_MAX_AGE_DAYS from the trade db.
// Due to limited resources on the cheap Virtual Private Server hosting data
// more than a year out of data doesn't seem worth the impact on performance.
tradeDb.exec(`
  DELETE FROM commodities WHERE updatedAt <= '${getISOTimestamp(`-${TRADE_DATA_MAX_AGE_DAYS}`)}'
`)

// TODO The trade database specifically should be vacuumed periodically to
// allow it to shrink in size as old data is deleted

optimize(tradeDb)
tradeDb.close()
console.timeEnd('Optimize tradeDb')

// ********* OPTIMIZE SYSTEMS DB *********
console.time('Optimize systemsDb')
optimize(systemsDb)
systemsDb.close()
console.timeEnd('Optimize systemsDb')

process.exit()

function optimize (db) {
  console.time('Database optimization')
  if (FULL_VACUUM === true) db.exec('VACUUM')
  // db.pragma('integrity_check')
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.pragma('optimize')
  db.pragma('analysis_limit=0')
  db.exec('ANALYZE')
  console.timeEnd('Database optimization')
}
