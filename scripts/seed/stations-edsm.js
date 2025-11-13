const fs = require('fs')
const readline = require('readline')
const { insertOrReplaceInto } = require('../../lib/sql-helper')
const SystemsDatabase = require('../../lib/db/systems-db')
const StationsDatabase = require('../../lib/db/stations-db')

// Station data seed from EDDB nightly dump
const SYSTEMS_JSON = '../ardent-seed-data/edsm/stations.json'

// Setting this to true is very fast (100,000 inserts a second) but ONLY safe
// to do a *new, empty datababase* with nothing else accessing it. If you stop
// the process you will need to delete the database and start again and let
// the import complete. It will corrupt any existing database.
const UNSAFE_FAST_IMPORT = true

// Fastest but will need many GB of RAM. Only works if UNSAFE_FAST_IMPORT also enabled.
const USE_TRANSACTIONS = true

// Import will grind to a halt if this is run without lots of extra ram
const USE_ADDITIONAL_RAM = true

;(async () => {
  let counter = 0

  const systemsDb = SystemsDatabase.getDatabase()
  const stationsDb = StationsDatabase.getDatabase()
  StationsDatabase.ensureTables()

  if (UNSAFE_FAST_IMPORT === true) {
    // Using 'synchronous = OFF' is much faster, but the database may end up
    // corrupted if the program crashes or the computer loses power (etc)
    stationsDb.pragma('synchronous = OFF')

    // Only change journal_mode from 'WAL' to 'OFF' when creating a new DB or you
    // may end up with massive journal files. Also gives significantly speed boost.
    stationsDb.pragma('journal_mode = OFF')

    // Only use locking_mode EXCLUSIVE if no other processes need to access the DB
    stationsDb.pragma('locking_mode = EXCLUSIVE')

    if (USE_ADDITIONAL_RAM === true) {
      stationsDb.pragma('cache_size = 1000000')
      stationsDb.pragma('temp_store = MEMORY')
    }
  }

  const selectSystemByName = systemsDb.prepare(`
    SELECT * FROM systems WHERE systemName = @systemName COLLATE NOCASE
  `)

  setInterval(() => console.log(`${counter.toLocaleString()} entries processed`), 1000 * 10).unref()

  async function sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  const readStream = fs.createReadStream(SYSTEMS_JSON)
  const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity })

  const systemsNotFound = []
  const stationsWithNoSystemLocation = []

  console.time('Importing stations')

  // Using BEGIN/COMMIT is faster but can use a very large amount of disk space
  // If you end up with a huge -wal file, you can use 'journal_mode = DELETE'
  // to reset it and get the diskspace back (do not just delete the -wal file!)
  if (UNSAFE_FAST_IMPORT === true && USE_TRANSACTIONS === true) stationsDb.prepare('BEGIN').run()
  for await (const line of rl) {
    if (line === '[' || line === ']') continue

    counter++

    // Every 10000 operations, fully pause for a second to manage load
    // (can remove this for extra speed). Disabled if using UNSAFE_FAST_IMPORT
    if (UNSAFE_FAST_IMPORT !== true) { if (counter % 10000 === 0) await sleep(1000) }

    try {
      const station = JSON.parse(line.replace(/,$/, '').trim())
      const system = selectSystemByName.get({ systemName: station.systemName })

      if (!system) {
        stationsWithNoSystemLocation.push(station.name)
        if (!systemsNotFound.includes(station.systemName)) systemsNotFound.push(station.systemName)
      }

      // This is not comprehensive for maxLandingPadSize as but is a good
      // starting point to augment with data from other sourcs (like EDDB dumps)
      let maxLandingPadSize
      if ([
        'Mega ship',
        'Fleet Carrier',
        'Planetary Port',
        'Orbis Starport',
        'Coriolis Starport',
        'Ocellus Starport',
        'Asteroid base'
      ].includes(station.type)) maxLandingPadSize = 3
      if ([
        'Outpost'
      ].includes(station.type)) maxLandingPadSize = 2

      insertOrReplaceInto(stationsDb, 'stations', {
        stationName: station.name,
        marketId: station.marketId,
        distanceToArrival: station.distanceToArrival,
        stationType: station.type,
        allegiance: station.allegiance,
        government: station.government,
        controllingFactionName: station?.controllingFaction?.name ?? null,
        primaryEconomy: station.economy,
        secondaryEconomy: station.secondEconomy,
        shipyard: station.haveShipyard ? 1 : 0,
        outfitting: station.haveOutfitting ? 1 : 0,
        blackMarket: station.otherServices.includes('Black Market') ? 1 : 0,
        contacts: station.otherServices.includes('Contacts') ? 1 : 0,
        crewLounge: station.otherServices.includes('Crew Lounge') ? 1 : 0,
        interstellarFactorsContact: station.otherServices.includes('Interstellar Factors Contact') ? 1 : 0,
        materialTrader: station.otherServices.includes('Material Trader') ? 1 : 0,
        missions: station.otherServices.includes('Missions') ? 1 : 0,
        refuel: station.otherServices.includes('Refuel') ? 1 : 0,
        repair: station.otherServices.includes('Repair') ? 1 : 0,
        restock: station.otherServices.includes('Restock') ? 1 : 0,
        searchAndRescue: station.otherServices.includes('Search and Rescue') ? 1 : 0,
        technologyBroker: station.otherServices.includes('Technology Broker') ? 1 : 0,
        tuning: station.otherServices.includes('Tuning') ? 1 : 0,
        universalCartographics: station.otherServices.includes('Universal Cartographics') ? 1 : 0,
        systemAddress: station.systemId64,
        systemName: station.systemName,
        systemX: system?.systemX ?? null,
        systemY: system?.systemY ?? null,
        systemZ: system?.systemZ ?? null,
        bodyId: station?.body?.id ?? null,
        bodyName: station?.body?.name ?? null,
        latitude: station?.body?.latitude ?? null,
        longitude: station?.body?.longitude ?? null,
        maxLandingPadSize,
        updatedAt: new Date(station.updateTime.information).toISOString()
      })

      // Allow other process to run
      await new Promise(setImmediate)
    } catch (e) {
      console.error('Failed to parse: ', line, e)
      continue
    }
  }

  if (UNSAFE_FAST_IMPORT === true && USE_TRANSACTIONS === true) stationsDb.prepare('COMMIT').run()

  console.timeEnd('Importing stations')

  console.time('Creating indexes')
  StationsDatabase.ensureIndexes()
  console.timeEnd('Creating indexes')

  stationsDb.close()

  console.log('Import complete')

  // console.log('Missing data:', systemsNotFound, stationsWithNoSystemLocation)
  console.log(`Failed to location for ${stationsWithNoSystemLocation.length} stations as ${systemsNotFound.length} systems not found`)
  console.log(`Loaded ${counter.toLocaleString()} stations`)
  process.exit()
})()
