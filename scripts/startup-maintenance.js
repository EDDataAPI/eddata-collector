// const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../lib/db')
// const { getISOTimestamp } = require('../lib/utils/dates')
const { execSync } = require('child_process')
const fs = require('fs')
const { EDDATA_STATIONS_DB, EDDATA_SYSTEMS_DB, EDDATA_TRADE_DB } = require('../lib/consts')

// The purpose of this is to be a place for any logic that needs to run at
// startup, before the service goes back online. It is not a script in the
// typical sense, in that it can / should only be invoked from the main
// thread, when the database is not otherwise being written to.
//
// The use case is primarily to support releases that involve changes to data
// in any of the databases (e.g. after refactoring, bug fixes, etc).
//
// The intention is that it should be safe to run any of these tasks multiple
// times, and that once they have been run at least once in production, any
// actions configured to run here will be removed from subsequent releases.

module.exports = async () => {
  console.time('Startup maintenance')

  console.log('Performing maintenance tasks...')

  // Generate database statistics and cache on every startup if databases exist
  const hasDatabases = fs.existsSync(EDDATA_STATIONS_DB) ||
                       fs.existsSync(EDDATA_SYSTEMS_DB) ||
                       fs.existsSync(EDDATA_TRADE_DB)

  if (hasDatabases) {
    console.log('Generating database statistics and cache...')
    try {
      execSync('npm run stats', { stdio: 'inherit' })
      console.log('Database statistics and cache generated successfully')
    } catch (error) {
      console.error('Failed to generate database statistics:', error.message)
    }
  } else {
    console.log('No databases found, skipping stats generation')
  }

  console.timeEnd('Startup maintenance')
}
