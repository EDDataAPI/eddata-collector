const path = require('path')
const fs = require('fs')

// Valid config file locations
const ARDENT_CONFIG_LOCATIONS = [
  '/etc/ardent.config',
  path.join(__dirname, '../../ardent.config'),
  path.join(__dirname, '../ardent.config')
]

for (const path of ARDENT_CONFIG_LOCATIONS.reverse()) {
  if (fs.existsSync(path)) require('dotenv').config({ path })
}

// Note: ARDENT_DOMAIN is not used when ARDENT_DOWNLOADS_BASE_URL is explicitly set
const ARDENT_DOMAIN = process.env?.ARDENT_DOMAIN ?? 'ardent-insight.com'

const ARDENT_DOWNLOADS_BASE_URL = process.env?.ARDENT_DOWNLOADS_BASE_URL ?? `https://downloads.${ARDENT_DOMAIN}`

const EDDN_SERVER = process.env?.EDDN_SERVER ?? 'tcp://eddn.edcd.io:9500'

const ARDENT_COLLECTOR_LOCAL_PORT = process.env?.ARDENT_COLLECTOR_LOCAL_PORT ?? 3002
const ARDENT_COLLECTOR_DEFAULT_CACHE_CONTROL = `public, max-age=${60 * 15}, stale-while-revalidate=${60 * 60}, stale-if-error${60 * 60}`

// Detect container environment and adjust paths accordingly
const isContainerEnv =
  process.env.NODE_ENV === 'production' ||
  fs.existsSync('/.dockerenv') ||
  fs.existsSync('/run/.containerenv') ||
  !!process.env.KUBERNETES_SERVICE_HOST ||
  fs.existsSync('/home/container') // Retain for Pterodactyl compatibility, if needed
const defaultDataDir = isContainerEnv
  ? path.join(process.cwd(), 'ardent-data')
  : path.join(__dirname, '../../ardent-data')
const defaultBackupDir = isContainerEnv
  ? path.join(process.cwd(), 'ardent-backup')
  : path.join(__dirname, '../../ardent-backup')
const defaultDownloadsDir = isContainerEnv
  ? path.join(process.cwd(), 'ardent-downloads')
  : path.join(__dirname, '../../ardent-downloads')

const ARDENT_DATA_DIR = process.env?.ARDENT_DATA_DIR ?? defaultDataDir
const ARDENT_CACHE_DIR = process.env?.ARDENT_CACHE_DIR ?? path.join(ARDENT_DATA_DIR, 'cache')
const ARDENT_BACKUP_DIR = process.env?.ARDENT_BACKUP_DIR ?? defaultBackupDir
const ARDENT_DOWNLOADS_DIR = process.env?.ARDENT_DOWNLOADS_DIR ?? defaultDownloadsDir
const ARDENT_BACKUP_LOG = path.join(ARDENT_BACKUP_DIR, 'backup.log')
const ARDENT_DATABASE_STATS = path.join(ARDENT_CACHE_DIR, 'database-stats.json')

const ARDENT_SYSTEMS_DB = path.join(ARDENT_DATA_DIR, 'systems.db')
const ARDENT_LOCATIONS_DB = path.join(ARDENT_DATA_DIR, 'locations.db')
const ARDENT_STATIONS_DB = path.join(ARDENT_DATA_DIR, 'stations.db')
const ARDENT_TRADE_DB = path.join(ARDENT_DATA_DIR, 'trade.db')

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

module.exports = {
  EDDN_SERVER,
  ARDENT_COLLECTOR_LOCAL_PORT,
  ARDENT_COLLECTOR_DEFAULT_CACHE_CONTROL,
  ARDENT_DATA_DIR,
  ARDENT_CACHE_DIR,
  ARDENT_BACKUP_DIR,
  ARDENT_BACKUP_LOG,
  ARDENT_DOWNLOADS_BASE_URL,
  ARDENT_DOWNLOADS_DIR,
  ARDENT_DATABASE_STATS,
  ARDENT_SYSTEMS_DB,
  ARDENT_LOCATIONS_DB,
  ARDENT_STATIONS_DB,
  ARDENT_TRADE_DB,
  SYSTEM_GRID_SIZE,
  SYSTEM_SECTOR_HASH_LENGTH,
  TRADE_DATA_MAX_AGE_DAYS,
  RESCUE_SHIP_MAX_AGE_DAYS,
  MAINTENANCE_DAY_OF_WEEK,
  MAINTENANCE_WINDOW_START_HOUR,
  MAINTENANCE_WINDOW_END_HOUR,
  FLEET_CARRIER_MAX_AGE_DAYS
}
