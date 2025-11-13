// This import script is intended to be run *after* importing a list of stations
// from EDSM data. It is older, but the EDDB data has info that is not in the
// EDSM dumps, such as station landing pad size.
const fs = require('fs')
const readline = require('readline')
const StationsDatabase = require('../../lib/db/stations-db')

// Station data seeded from EDDB (before it shut down)
const SYSTEMS_JSON = '../eddata-seed-data/eddb/stations.jsonl'

// Setting this to true is very fast (100,000 inserts a second) but ONLY safe
// to do a *new, empty database* with nothing else accessing it. If you stop
// the process you will need to delete the database and start again and let
// the import complete. It will corrupt any existing database.
const UNSAFE_FAST_IMPORT = true

// Fastest but will need many GB of RAM. Only works if UNSAFE_FAST_IMPORT also enabled.
const USE_TRANSACTIONS = true

// Import will grind to a halt if this is run without lots of extra ram
const USE_ADDITIONAL_RAM = true

// Landing pad size mapping
const PAD_SIZE_MAP = { S: 1, M: 2, L: 3 }

;(async () => {
  let counter = 0

  const stationsDb = StationsDatabase.getDatabase()
  StationsDatabase.ensureTables()

  if (UNSAFE_FAST_IMPORT) {
    // Using 'synchronous = OFF' is much faster, but the database may end up
    // corrupted if the program crashes or the computer loses power (etc)
    stationsDb.pragma('synchronous = OFF')

    // Only change journal_mode from 'WAL' to 'OFF' when creating a new DB or you
    // may end up with massive journal files. Also gives significantly speed boost.
    stationsDb.pragma('journal_mode = OFF')

    // Only use locking_mode EXCLUSIVE if no other processes need to access the DB
    stationsDb.pragma('locking_mode = EXCLUSIVE')

    if (USE_ADDITIONAL_RAM) {
      stationsDb.pragma('cache_size = 1000000')
      stationsDb.pragma('temp_store = MEMORY')
    }
  }

  setInterval(() => console.log(`${counter.toLocaleString()} entries processed`), 1000 * 10).unref()

  async function sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  const readStream = fs.createReadStream(SYSTEMS_JSON)
  const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity })

  const updateStationDataByMarketId = stationsDb.prepare(
    'UPDATE stations SET maxLandingPadSize = @maxLandingPadSize WHERE marketId = @marketId'
  )

  console.time('Importing stations')

  // Using BEGIN/COMMIT is faster but can use a very large amount of disk space
  // If you end up with a huge -wal file, you can use 'journal_mode = DELETE'
  // to reset it and get the diskspace back (do not just delete the -wal file!)
  if (UNSAFE_FAST_IMPORT && USE_TRANSACTIONS) stationsDb.prepare('BEGIN').run()
  for await (const line of rl) {
    if (line === '[' || line === ']') continue

    counter++

    // Every 10000 operations, fully pause for a second to manage load
    // (can remove this for extra speed). Disabled if using UNSAFE_FAST_IMPORT
    if (!UNSAFE_FAST_IMPORT && counter % 10000 === 0) await sleep(1000)

    try {
      const station = JSON.parse(line.replace(/,$/, '').trim())

      const maxLandingPadSize = PAD_SIZE_MAP[station.max_landing_pad_size]

      if (station.ed_market_id && maxLandingPadSize) {
        updateStationDataByMarketId.run({
          marketId: station.ed_market_id,
          maxLandingPadSize
        })
      }

      // Allow other process to run
      await new Promise(setImmediate)
    } catch (e) {
      console.error('Failed to parse: ', line, e)
      continue
    }
  }

  if (UNSAFE_FAST_IMPORT && USE_TRANSACTIONS) stationsDb.prepare('COMMIT').run()

  console.timeEnd('Importing stations')

  console.time('Creating indexes')
  StationsDatabase.ensureIndexes()
  console.timeEnd('Creating indexes')

  stationsDb.close()

  console.log('Import complete')

  console.log(`Loaded ${counter.toLocaleString()} stations`)
  process.exit()
})()
