const Package = require('./package.json')

// Prepend time (HH:MM:SS) to all console output to improve logs and tracing
const _origConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
}
const _ts = () => new Date().toTimeString().substr(0, 8)
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => {
    const prefix = `[${_ts()}]`
    if (args.length > 0 && typeof args[0] === 'string') {
      // Prepend timestamp into the format string so util.format still works
      args[0] = `${prefix} ${args[0]}`
      _origConsole[level](...args)
    } else {
      _origConsole[level](prefix, ...args)
    }
  }
}

console.log(`EDData Collector v${Package.version} starting`)
console.log(_ts())

// Initalise default value for env vars before other imports
console.log('Configuring environment …')
const {
  EDDN_SERVER,
  EDDATA_BACKUP_LOG,
  EDDATA_DATABASE_STATS,
  EDDATA_COLLECTOR_LOCAL_PORT,
  EDDATA_COLLECTOR_DEFAULT_CACHE_CONTROL,
  EDDATA_TRADE_DB,
  EDDATA_STATIONS_DB,
  EDDATA_LOCATIONS_DB,
  EDDATA_DATA_DIR,
  EDDATA_CACHE_DIR,
  EDDATA_BACKUP_DIR,
  EDDATA_DOWNLOADS_DIR,
  MAINTENANCE_DAY_OF_WEEK,
  MAINTENANCE_WINDOW_START_HOUR,
  MAINTENANCE_WINDOW_END_HOUR
} = require('./lib/consts')

// In development this can be used to capture real-world payload examples
const SAVE_PAYLOAD_EXAMPLES = false
const PAYLOAD_EXAMPLES_DIR = './tests/payload-examples'

console.log('Loading dependancies …')
const { exec } = require('child_process')
const process = require('process')
const fs = require('fs')
const zmq = require('zeromq')
const zlib = require('zlib')
const cron = require('node-cron')
const Koa = require('koa')
const KoaRouter = require('@koa/router')
const koaBodyParser = require('koa-bodyparser')

console.log('Ensuring required directories exist …')
// Create required directories inline
const requiredDirectories = [EDDATA_DATA_DIR, EDDATA_CACHE_DIR, EDDATA_BACKUP_DIR, EDDATA_DOWNLOADS_DIR]
for (const dir of requiredDirectories) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      console.log(`Created directory: ${dir}`)
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error.message)
    }
  }
}

console.log('Connecting to databases …')
require('./lib/db')

console.log('Loading libraries …')
const startupMaintenance = require('./scripts/startup-maintenance')
const commodityEvent = require('./lib/event-handlers/commodity-event')
const discoveryScanEvent = require('./lib/event-handlers/discovery-scan-event')
const navRouteEvent = require('./lib/event-handlers/navroute-event')
const approachSettlementEvent = require('./lib/event-handlers/approach-settlement-event')
const journalEvent = require('./lib/event-handlers/journal-event')
const { closeAllDatabaseConnections, tradeDb } = require('./lib/db')

// Simple Node.js 24 optimizations inline
const startTime = performance.now()
const messageCache = new Set() // Simple Set for duplicate detection
const MESSAGE_CACHE_MAX_SIZE = 50000 // Max entries before cleanup
const MESSAGE_CACHE_CLEANUP_SIZE = 25000 // Remove this many oldest entries on cleanup
let messageCount = 0

// Helper functions
function performanceMark (name) {
  performance.mark(name)
}

function getPerformanceDuration (startMark) {
  try {
    const endMark = `${startMark}-end`
    performance.mark(endMark)
    performance.measure(`${startMark}-duration`, startMark, endMark)
    const measure = performance.getEntriesByName(`${startMark}-duration`)[0]
    return measure ? measure.duration : 0
  } catch (e) {
    return Date.now() - startTime
  }
}

function getMemoryInfo () {
  const usage = process.memoryUsage()
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024)
  }
}

// Mark application start
performanceMark('app-start')

// When this is set don't write events to the database
let databaseWriteLocked = false
function enableDatabaseWriteLock () { databaseWriteLocked = true }
function disableDatabaseWriteLock () { databaseWriteLocked = false }

// A best effort approach try and keep seelct database files cached in RAM if
// running on a Linux system that has vmtouch (i.e. like the production server).
//
// This is done to improve read performance in the API, but it is handled by
// the Collector so it can be controlled to allow memory to be freed up during
// operations like maintenance windows.
//
// The hard disk is an NVMe drive and is reasonably performant and consistent
// so this works reliably, but reading when cached in RAM is still much faster.
//
// Unlike a ramdisk or a strictly in memory database performance is not assured
// but the trade off is flexibility to grown the database in size and ease of
// system management.
let databaseCacheTriggerInterval = null
let databaseCacheTriggersetTimeout = null
const cacheTriggerFrequencyInSeconds = 0 // Disabled for now, only runs at startup
function enableDatabaseCacheTrigger () {
  // Run once immediately, can take up to 90 seconds to complete.
  // Subsequent runs typically take < 5 seconds.
  databaseCacheTrigger()
  if (cacheTriggerFrequencyInSeconds > 0) {
    databaseCacheTriggersetTimeout = setTimeout(() => {
      databaseCacheTriggerInterval = setInterval(databaseCacheTrigger, 1000 * cacheTriggerFrequencyInSeconds)
    }, 1000 * 60 * 2) // Wait 2 minutes after first run to start
  }
}
function disableDatabaseCacheTrigger () {
  clearTimeout(databaseCacheTriggersetTimeout)
  clearInterval(databaseCacheTriggerInterval)
}
function databaseCacheTrigger () {
  const cmd = '/usr/bin/vmtouch'
  if (fs.existsSync(cmd)) {
    exec(`${cmd} -t ${EDDATA_TRADE_DB}*`, (err, stdout, stderr) => {
      if (err) console.error('Error on cache trigger for Trade DB:', err, stdout, stderr)
    })
    exec(`${cmd} -t ${EDDATA_STATIONS_DB}*`, (err, stdout, stderr) => {
      if (err) console.error('Error on cache trigger for Station DB:', err, stdout, stderr)
    })
    exec(`${cmd} -t ${EDDATA_LOCATIONS_DB}*`, (err, stdout, stderr) => {
      if (err) console.error('Error on cache trigger for Locations DB:', err, stdout, stderr)
    })
  }
}

// Ensure payload example dir (and journal examples sub dir) exists
if (SAVE_PAYLOAD_EXAMPLES === true &&
    !fs.existsSync(`${PAYLOAD_EXAMPLES_DIR}/journal_1`)) {
  fs.mkdirSync(`${PAYLOAD_EXAMPLES_DIR}/journal_1`, { recursive: true })
}

;(async () => {
  // Start web service
  console.log('Starting web service')
  const app = new Koa()
  const router = new KoaRouter()
  app.use(koaBodyParser())

  // Set default cache headers
  app.use((ctx, next) => {
    ctx.set('Cache-Control', EDDATA_COLLECTOR_DEFAULT_CACHE_CONTROL)
    ctx.set('EDData-Collector-Version', `${Package.version}`)
    return next()
  })

  // API Routes
  router.get('/', (ctx) => { ctx.body = printStats() })

  // Health check endpoint for load balancers
  router.get('/health', (ctx) => {
    ctx.body = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: Package.version,
      uptime: Math.round((performance.now() - startTime) / 1000)
    }
  })

  app.use(router.routes())

  app.listen(EDDATA_COLLECTOR_LOCAL_PORT)
  console.log('Web service online')

  console.log(`Connecting to EDDN ${EDDN_SERVER}…`)
  const socket = new zmq.Subscriber()
  socket.connect(EDDN_SERVER)
  socket.subscribe('')
  console.log('Connected to EDDN')

  await startupMaintenance()

  // If a backup log does not exist, create a new backup immediately
  if (!fs.existsSync(EDDATA_BACKUP_LOG)) {
    console.log('No backup log found, creating backup now')
    enableDatabaseWriteLock()

    exec('npm run backup', (error, stdout, stderr) => {
      if (error) console.error(error)
      disableDatabaseWriteLock()
    })
  } else {
    console.log('Confirmed existing backup log found')
  }

  // ABOUT THE MAINTENANCE WINDOW
  //
  // The maintenance window is aligned with the window for the game, which is
  // usually 7AM UTC on a Thursday.
  //
  // During the maintenance window the API and website continue running and
  // performance of them should not be impacted.
  //
  // EDData maintenance tasks - like optimising the databases and creating
  // backups - takes around 15-30 minutes. The actual game maintenance window
  // usually is from 7AM to 9AM UTC and commonly takes 2-3 hours, so we these
  // tasks should all be finished long before the game comes back online.
  //
  // The API and Collector are restarted at 9 AM daily - see below for why.
  //
  // WHY PROCESS ARE RESTARTED
  //
  // With SQLite, only connections opened after optimization take advantage of
  // optimization runs so services that connect to the database - the Collector
  // and the API - are automatically restarted by the `pm2` process manager.
  // The website does not connect to the database directly and so does not need
  // to be restarted.
  //
  // While our maintenance window starts at 7 AM and blocking tasks are usually
  // complete within 15-30 minutes, we wait until 9 AM to restart processes.
  //
  // WHY WRITING TO THE DATABASE IS SUSPENDED DURING THE MAINTENANCE WINDOW
  //
  // Both optimization and backup tasks impact writing to the database. Ideally
  // requests could be buffered during that time, but if the game is offline
  // then we don't need to worry about lost messages.
  //
  // As long as the server is fast enough and the number of writes is low if we
  // didn't explicitly block writing queries we could do this at any time, but
  // in practice it causes timeouts and errors and it will take longer for the
  // tasks to complete, so in practice a maintenance window works out well,
  // especially given the the game itself has one and so is offline anyway.
  cron.schedule(`0 0 ${MAINTENANCE_WINDOW_START_HOUR} * * ${MAINTENANCE_DAY_OF_WEEK}`, () => {
    enableDatabaseWriteLock() // Disable writing to database during maintenance
    disableDatabaseCacheTrigger() // Disable cache trigger during maintenance

    exec('npm run optimize', (error, stdout, stderr) => {
      if (error) console.error(error)

      // The backup takes around 15 minutes to complete, with most of that
      // being down to the systems database (around 150 million entires). This
      // could be optimised but there isn't really a need to.
      exec('npm run backup', (error, stdout, stderr) => {
        if (error) console.error(error)

        disableDatabaseWriteLock() // Mark database as open for writing again
        enableDatabaseCacheTrigger() // Re-enable database cache trigger after backup

        // Commpress generated backups to make them avalible for download in the
        // background. This has fairly low CPU impact but can take a while.
        exec('npm run backup:compress', (error, stdout, stderr) => {
          if (error) console.error(error)
        })
      })
    })
  })

  cron.schedule(`0 15 ${MAINTENANCE_WINDOW_END_HOUR} * * ${MAINTENANCE_DAY_OF_WEEK}`, () => {
    // Low priority task run after the maintenance window is complete...

    // Generating stats does not block anything but can be slow and the queries
    // are quite heavy as they involve scanning and performing analysis on the
    // entire trading database so it's best done infrequently and ideally soon
    // after an optimiztion pass.
    //
    // Fixed: Stats generation has been refactored to leverage new trade db schema
    // and exclude Fleet Carrier data properly
    exec('npm run stats:commodity', (error, stdout, stderr) => {
      if (error) console.error(error)
    })
  })

  // Generate stats 4x daily to minimize DB locks from snapshot creation
  // Snapshots cache for 6h, so this alignment reduces VACUUM INTO conflicts
  cron.schedule('0 */6 * * *', () => { // Every 6 hours: 00:00, 06:00, 12:00, 18:00
    console.log('Running 6-hourly stats generation (using snapshots)...')
    exec('npm run stats', (error, stdout, stderr) => {
      if (error) {
        console.error('Stats generation failed:', error.message)
      } else {
        console.log('Stats generation completed successfully')
      }
    })
  })

  // Weekly VACUUM of trade database to reclaim disk space after deleting old data
  cron.schedule('0 3 * * 0', () => { // Every Sunday at 3 AM
    console.log('Starting weekly VACUUM of trade database...')
    databaseWriteLocked = true
    try {
      console.time('VACUUM trade.db')
      tradeDb.exec('VACUUM')
      console.timeEnd('VACUUM trade.db')
      console.log('Trade database VACUUM completed successfully')
    } catch (error) {
      console.error('Error during VACUUM:', error)
    } finally {
      databaseWriteLocked = false
    }
  })

  enableDatabaseCacheTrigger() // Enable cache trigger

  console.log(printStats())
  console.log('EDData Collector ready!')

  // Enhanced message processing with Node.js 24 optimizations
  performanceMark('message-processing-start')

  // Dead letter queue for buffering messages during DB locks
  const messageBuffer = []
  let processingBuffer = false

  // Helper function to process a single message
  function processMessageData (message) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    zlib.inflate(message, (error, chunk) => {
      clearTimeout(timeoutId)
      if (error) return console.error(error)
      if (controller.signal.aborted) return

      const payload = JSON.parse(chunk.toString('utf8'))
      const schema = payload?.$schemaRef ?? 'SCHEMA_UNDEFINED'

      // Simple duplicate detection using Set
      const cacheKey = `${schema}-${payload?.header?.gatewayTimestamp || payload?.header?.timestamp || Date.now()}`
      if (messageCache.has(cacheKey)) {
        return // Already processed recently
      }

      // Ignore messages that are not from the live version of the game
      // i.e. At least version 4.0.0.0 -or- the version starts with 'CAPI-Live-'
      // which indicates the data has come from the live API provided by FDev.
      // This will mean we ignore some messages from software that is not
      // behaving correctly but we can't trust data from old software anyway as
      // it might be from someone running a legacy version of the game.
      const gameMajorVersion = Number(payload?.header?.gameversion?.split('.')?.[0] ?? 0)
      if (gameMajorVersion < 4 && !payload?.header?.gameversion?.startsWith('CAPI-Live-')) { return }

      // Cache processed message to avoid duplicate processing
      messageCache.add(cacheKey)

      // Prevent memory leak: cleanup cache when it gets too large
      if (messageCache.size > MESSAGE_CACHE_MAX_SIZE) {
        const iterator = messageCache.values()
        for (let i = 0; i < MESSAGE_CACHE_CLEANUP_SIZE; i++) {
          messageCache.delete(iterator.next().value)
        }
        console.log(`Cache cleanup: reduced from ${MESSAGE_CACHE_MAX_SIZE} to ${messageCache.size} entries`)
      }

      // Performance tracking
      messageCount++
      if (messageCount % 1000 === 0) {
        const duration = getPerformanceDuration('message-processing-start')
        console.log(`Processed ${messageCount} messages in ${Math.round(duration)}ms (avg: ${Math.round(duration / messageCount)}ms/msg)`)
      }

      // If we don't have an example message and SAVE_PAYLOAD_EXAMPLES is true, save it
      if (SAVE_PAYLOAD_EXAMPLES) {
        if (schema === 'https://eddn.edcd.io/schemas/journal/1') {
          // Journal entries are a special case (they represent different game events and are raw events, not synthetic)
          if (!fs.existsSync(`${PAYLOAD_EXAMPLES_DIR}/journal_1/${payload.message.event.toLowerCase()}.json`)) {
            fs.writeFileSync(`${PAYLOAD_EXAMPLES_DIR}/journal_1/${payload.message.event.toLowerCase()}.json`, JSON.stringify(payload, null, 2))
          }
        } else {
          const schemaFileName = schema.replace('https://eddn.edcd.io/schemas/', '').replaceAll('/', '_')
          if (!fs.existsSync(`${PAYLOAD_EXAMPLES_DIR}/${schemaFileName}.json`)) { fs.writeFileSync(`${PAYLOAD_EXAMPLES_DIR}/${schemaFileName}.json`, JSON.stringify(payload, null, 2)) }
        }
      }
      switch (schema) {
        case 'https://eddn.edcd.io/schemas/commodity/3':
          commodityEvent(payload)
          break
        case 'https://eddn.edcd.io/schemas/fssdiscoveryscan/1':
          discoveryScanEvent(payload)
          break
        case 'https://eddn.edcd.io/schemas/navroute/1':
          navRouteEvent(payload)
          break
        case 'https://eddn.edcd.io/schemas/approachsettlement/1':
          approachSettlementEvent(payload)
          break
        case 'https://eddn.edcd.io/schemas/journal/1':
          journalEvent(payload)
          break
      }
    })
  }

  ;(async () => {
    for await (const [message] of socket) {
      if (databaseWriteLocked === true) {
        // Buffer messages when DB is locked (e.g., during backup/stats)
        messageBuffer.push(message)
        if (messageBuffer.length % 100 === 0) {
          console.log(`Buffered ${messageBuffer.length} messages during DB lock`)
        }
        await new Promise(setImmediate)
        continue
      }

      // Process buffered messages first
      if (messageBuffer.length > 0 && !processingBuffer) {
        processingBuffer = true
        console.log(`Processing ${messageBuffer.length} buffered messages...`)
        for (const bufferedMessage of messageBuffer) {
          try {
            processMessageData(bufferedMessage)
          } catch (error) {
            console.error('Error processing buffered message:', error.message)
          }
        }
        messageBuffer.length = 0 // Clear buffer
        processingBuffer = false
        console.log('Buffered messages processed')
      }

      // Process current message
      try {
        processMessageData(message)
      } catch (error) {
        console.error('Message processing error:', error.message)
      }
    }
  })()
})() // Close the main IIFE

process.on('SIGTERM', () => {
  console.log('EDData Collector received SIGTERM signal')
  closeAllDatabaseConnections()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('EDData Collector received SIGINT signal')
  closeAllDatabaseConnections()
  process.exit(0)
})

process.on('uncaughtException', (e) => console.log('Uncaught exception:', e))

function printStats () {
  let stats = null

  try {
    if (fs.existsSync(EDDATA_DATABASE_STATS)) {
      stats = JSON.parse(fs.readFileSync(EDDATA_DATABASE_STATS))
    }
  } catch (error) {
    console.log('Warning: Could not read database stats:', error.message)
  }

  // Get Node.js 24 performance metrics
  const memoryInfo = getMemoryInfo()
  const uptime = Math.round((performance.now() - startTime) / 1000)

  try {
    return `EDData Collector v${Package.version} Online\n` +
      '--------------------------\n' +
      ((stats)
        ? 'Locations:\n' +
          `* Star systems: ${stats.systems.toLocaleString()}\n` +
          `* Points of interest: ${stats.pointsOfInterest.toLocaleString()}\n` +
          'Stations:\n' +
          `* Stations: ${stats.stations.stations.toLocaleString()}\n` +
          `* Fleet Carriers: ${stats.stations.carriers.toLocaleString()}\n` +
          `* Station updates in last 24 hours: ${stats.stations.updatedInLast24Hours.toLocaleString()}\n` +
          'Trade:\n' +
          `* Markets: ${stats.trade.markets.toLocaleString()}\n` +
          `* Trade orders: ${stats.trade.orders.toLocaleString()}\n` +
          `* Trade updates in last 24 hours: ${stats.trade.updatedInLast24Hours.toLocaleString()}\n` +
          `* Unique commodities: ${stats.trade.uniqueCommodities.toLocaleString()}\n` +
          `Stats last updated: ${stats.timestamp}\n`
        : 'Stats not generated yet\n') +
      '\nNode.js 24 Performance:\n' +
      `* Runtime: ${uptime}s\n` +
      `* Memory Usage: ${memoryInfo.heapUsed}MB / ${memoryInfo.heapTotal}MB\n` +
      `* Cache Size: ${messageCache.size} items\n` +
      `* Messages Processed: ${messageCount}\n` +
      `* Node.js: ${process.version}`
  } catch (e) {
    console.error('Error rendering stats:', e.message, e.stack)
    return `Error: Could not load stats - ${e.message}`
  }
}
