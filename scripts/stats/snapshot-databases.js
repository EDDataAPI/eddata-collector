const path = require('node:path')
const fs = require('node:fs')
const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../../lib/db')

/**
 * Creates read-only snapshots of all databases for stats generation
 * Uses SQLite's VACUUM INTO for fast, consistent copies without blocking production
 *
 * Snapshots are stored in ./data/.snapshots/ and refreshed hourly
 * Stats generation runs against snapshots instead of live databases
 */

const SNAPSHOT_DIR = path.join(__dirname, '../../data/.snapshots')
const SNAPSHOT_AGE_LIMIT = 2 * 60 * 60 * 1000 // 2 hours in milliseconds

const databases = [
  { db: systemsDb, name: 'systems.db' },
  { db: locationsDb, name: 'locations.db' },
  { db: stationsDb, name: 'stations.db' },
  { db: tradeDb, name: 'trade.db' }
]

/**
 * Check if snapshots exist and are recent enough
 * @returns {boolean} True if snapshots are fresh
 */
function areSnapshotsFresh () {
  if (!fs.existsSync(SNAPSHOT_DIR)) return false

  for (const { name } of databases) {
    const snapshotPath = path.join(SNAPSHOT_DIR, name)
    if (!fs.existsSync(snapshotPath)) return false

    const stats = fs.statSync(snapshotPath)
    const age = Date.now() - stats.mtimeMs
    if (age > SNAPSHOT_AGE_LIMIT) return false
  }

  return true
}

/**
 * Create database snapshots using VACUUM INTO
 * Fast, atomic, and doesn't block production database
 */
function createSnapshots () {
  console.log('Creating database snapshots for stats generation...')
  console.time('Created database snapshots')

  // Ensure snapshot directory exists
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
  }

  for (const { db, name } of databases) {
    const snapshotPath = path.join(SNAPSHOT_DIR, name)

    // Remove old snapshot files
    try {
      fs.rmSync(snapshotPath, { force: true })
      fs.rmSync(`${snapshotPath}-journal`, { force: true })
      fs.rmSync(`${snapshotPath}-shm`, { force: true })
      fs.rmSync(`${snapshotPath}-wal`, { force: true })
    } catch (error) {
      console.warn(`Warning: Could not remove old snapshot ${name}:`, error.message)
    }

    // Create snapshot using VACUUM INTO (fast, consistent, non-blocking)
    try {
      console.log(`  Snapshotting ${name}...`)
      const startTime = performance.now()
      db.exec(`VACUUM INTO '${snapshotPath}'`)
      const duration = Math.round(performance.now() - startTime)

      const stats = fs.statSync(snapshotPath)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
      console.log(`  ✓ ${name} snapshot created (${sizeMB} MB) in ${duration}ms`)
    } catch (error) {
      console.error(`  ✗ Failed to create snapshot for ${name}:`, error.message)
      throw error
    }
  }

  console.timeEnd('Created database snapshots')
}

/**
 * Get paths to snapshot databases
 * @returns {Object} Paths to snapshot databases
 */
function getSnapshotPaths () {
  return {
    systemsDb: path.join(SNAPSHOT_DIR, 'systems.db'),
    locationsDb: path.join(SNAPSHOT_DIR, 'locations.db'),
    stationsDb: path.join(SNAPSHOT_DIR, 'stations.db'),
    tradeDb: path.join(SNAPSHOT_DIR, 'trade.db')
  }
}

// If run directly, create snapshots
if (require.main === module) {
  try {
    createSnapshots()
    console.log('\n✓ Database snapshots ready for stats generation')
    console.log(`  Location: ${SNAPSHOT_DIR}`)
  } catch (error) {
    console.error('\n✗ Snapshot creation failed:', error.message)
    process.exit(1)
  }
}

module.exports = {
  createSnapshots,
  areSnapshotsFresh,
  getSnapshotPaths,
  SNAPSHOT_DIR
}
