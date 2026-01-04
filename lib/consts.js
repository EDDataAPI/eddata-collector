const path = require('path')
const fs = require('fs')

// Valid config file locations
const EDDATA_CONFIG_LOCATIONS = [
  '/etc/eddata.config',
  path.join(__dirname, '../../eddata.config'),
  path.join(__dirname, '../eddata.config')
]

for (const configPath of EDDATA_CONFIG_LOCATIONS.reverse()) {
  if (fs.existsSync(configPath)) require('dotenv').config({ path: configPath })
}

// Note: EDDATA_DOMAIN is not used when EDDATA_DOWNLOADS_BASE_URL is explicitly set
const EDDATA_DOMAIN = process.env?.EDDATA_DOMAIN ?? 'eddata.api.com'

const EDDATA_DOWNLOADS_BASE_URL = process.env?.EDDATA_DOWNLOADS_BASE_URL ?? `https://downloads.${EDDATA_DOMAIN}`

const EDDN_SERVER = process.env?.EDDN_SERVER ?? 'tcp://eddn.edcd.io:9500'

const EDDATA_COLLECTOR_LOCAL_PORT = process.env?.EDDATA_COLLECTOR_LOCAL_PORT ?? 3002
const EDDATA_COLLECTOR_DEFAULT_CACHE_CONTROL = `public, max-age=${60 * 15}, stale-while-revalidate=${60 * 60}, stale-if-error=${60 * 60}`

// Detect container environment and adjust paths accordingly
const isContainerEnv =
  process.env.NODE_ENV === 'production' ||
  fs.existsSync('/.dockerenv') ||
  fs.existsSync('/run/.containerenv') ||
  !!process.env.KUBERNETES_SERVICE_HOST ||
  fs.existsSync('/home/container') // Retain for compatibility with container platforms
const defaultDataDir = isContainerEnv
  ? path.join(process.cwd(), 'eddata-data')
  : path.join(__dirname, '../eddata-data')
const defaultBackupDir = isContainerEnv
  ? path.join(process.cwd(), 'eddata-backup')
  : path.join(__dirname, '../eddata-backup')
const defaultDownloadsDir = isContainerEnv
  ? path.join(process.cwd(), 'eddata-downloads')
  : path.join(__dirname, '../eddata-downloads')

const EDDATA_DATA_DIR = process.env?.EDDATA_DATA_DIR ?? defaultDataDir
const EDDATA_CACHE_DIR = process.env?.EDDATA_CACHE_DIR ?? path.join(EDDATA_DATA_DIR, 'cache')
const EDDATA_BACKUP_DIR = process.env?.EDDATA_BACKUP_DIR ?? defaultBackupDir
const EDDATA_DOWNLOADS_DIR = process.env?.EDDATA_DOWNLOADS_DIR ?? defaultDownloadsDir
const EDDATA_BACKUP_LOG = path.join(EDDATA_BACKUP_DIR, 'backup.log')
const EDDATA_DATABASE_STATS = path.join(EDDATA_CACHE_DIR, 'database-stats.json')

const EDDATA_SYSTEMS_DB = path.join(EDDATA_DATA_DIR, 'systems.db')
const EDDATA_LOCATIONS_DB = path.join(EDDATA_DATA_DIR, 'locations.db')
const EDDATA_STATIONS_DB = path.join(EDDATA_DATA_DIR, 'stations.db')
const EDDATA_TRADE_DB = path.join(EDDATA_DATA_DIR, 'trade.db')

// Data in the Systems DB assumes these values and needs rebuilding if changes
const SYSTEM_GRID_SIZE = 100 // In light years
const SYSTEM_SECTOR_HASH_LENGTH = 8 // Enough to minimise sector ID collisions

const TRADE_DATA_MAX_AGE_DAYS = 90
const RESCUE_SHIP_MAX_AGE_DAYS = 7
const FLEET_CARRIER_MAX_AGE_DAYS = 90

// Automatic maintenance starts at 7 AM UTC on Thursdays, which is aligned with
// the weekly maintenance window for the game itself. It takes around an hour
// to purge old data, optimise the databases and create backups, two hours
// is allocated to provide a buffer.
//
// When the maintenance window offically ends at at 9 AM UTC the services will
// be reloaded so they take advantage of the recently performed database
// optimisations - a quirk of SQLite is that connections need to be restablished
// after a database has been optimized and that's the easiest way to do that.
//
// During the maintenance window the site and the API remain fully operational;
// the service stops ingesting new data until the maintenance tasks are done,
// but the game is offline at the same time anyway so no new data is coming in.
const MAINTENANCE_DAY_OF_WEEK = 4 // 4 is Thursdays
const MAINTENANCE_WINDOW_START_HOUR = 7 // Starts at 7 AM UTC
const MAINTENANCE_WINDOW_END_HOUR = 9 // Ends at 9 AM UTC

// Performance: Skip startup maintenance for faster restarts when cache is fresh
// Set to 'true' to completely skip integrity checks and stats generation on startup
const SKIP_STARTUP_MAINTENANCE = process.env?.SKIP_STARTUP_MAINTENANCE === 'true'

// Performance: Skip slow regional commodity reports (Core Systems, Colonia)
// These reports take 5-10 minutes to generate and are rarely used
// Set to 'true' to skip them and speed up stats generation by 80%
const SKIP_REGIONAL_COMMODITY_REPORTS = process.env?.SKIP_REGIONAL_COMMODITY_REPORTS === 'true'

module.exports = {
  EDDN_SERVER,
  EDDATA_COLLECTOR_LOCAL_PORT,
  EDDATA_COLLECTOR_DEFAULT_CACHE_CONTROL,
  EDDATA_DATA_DIR,
  EDDATA_CACHE_DIR,
  EDDATA_BACKUP_DIR,
  EDDATA_BACKUP_LOG,
  EDDATA_DOWNLOADS_BASE_URL,
  EDDATA_DOWNLOADS_DIR,
  EDDATA_DATABASE_STATS,
  EDDATA_SYSTEMS_DB,
  EDDATA_LOCATIONS_DB,
  EDDATA_STATIONS_DB,
  EDDATA_TRADE_DB,
  SYSTEM_GRID_SIZE,
  SYSTEM_SECTOR_HASH_LENGTH,
  TRADE_DATA_MAX_AGE_DAYS,
  RESCUE_SHIP_MAX_AGE_DAYS,
  MAINTENANCE_DAY_OF_WEEK,
  MAINTENANCE_WINDOW_START_HOUR,
  MAINTENANCE_WINDOW_END_HOUR,
  FLEET_CARRIER_MAX_AGE_DAYS,
  SKIP_STARTUP_MAINTENANCE,
  SKIP_REGIONAL_COMMODITY_REPORTS
}
