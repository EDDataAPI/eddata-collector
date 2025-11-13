const path = require('path')
const fs = require('fs')
const os = require('os')
const checkDiskSpace = require('check-disk-space').default
const byteSize = require('byte-size')

// Synchronous folder size calculation with depth limiting
// Used for pre-backup disk space checks
function getFolderSizeSync (folderPath) {
  try {
    let totalSize = 0
    const visited = new Set()
    const maxDepth = 50

    function calculateSizeSync (dirPath, currentDepth = 0) {
      if (currentDepth > maxDepth) {
        console.warn(`Warning: Maximum depth (${maxDepth}) reached for ${dirPath}`)
        return
      }

      try {
        const realPath = fs.realpathSync(dirPath)
        if (visited.has(realPath)) {
          return // Avoid circular symlinks
        }
        visited.add(realPath)

        const items = fs.readdirSync(dirPath, { withFileTypes: true })

        for (const item of items) {
          const fullPath = path.join(dirPath, item.name)

          if (item.isFile()) {
            try {
              const stats = fs.statSync(fullPath, { bigint: false })
              totalSize += Number(stats.size)
            } catch (statError) {
              console.warn(`Warning: Could not stat file ${fullPath}:`, statError.message)
            }
          } else if (item.isDirectory()) {
            calculateSizeSync(fullPath, currentDepth + 1)
          }
          // Skip symbolic links, sockets, FIFOs, etc.
        }
      } catch (error) {
        // Ignore permission errors or missing directories
        console.warn(`Warning: Could not access ${dirPath}:`, error.message)
      }
    }

    if (fs.existsSync(folderPath)) {
      calculateSizeSync(folderPath)
    }

    return totalSize
  } catch (error) {
    console.error('Error calculating folder size:', error.message)
    return 0
  }
}

const {
  writeBackupLog,
  backupDatabase,
  verifyBackup
} = require('../lib/backup')

const {
  EDDATA_DATA_DIR,
  EDDATA_BACKUP_DIR,
  EDDATA_BACKUP_LOG
} = require('../lib/consts')

const TEN_KB_IN_BYTES = 10000
const TEN_MB_IN_BYTES = 10000000

const { locationsDb, tradeDb, stationsDb, systemsDb } = require('../lib/db')

;(async () => {
  console.log(`Writing backup log to ${EDDATA_BACKUP_LOG}`)
  if (!fs.existsSync(EDDATA_BACKUP_DIR)) { fs.mkdirSync(EDDATA_BACKUP_DIR, { recursive: true }) }

  const started = new Date().toISOString()
  const verifyResults = []

  writeBackupLog(`Starting backup at ${started}`, true)
  /** * PRE-FLIGHT CHECKS  ****/
  const pathToLocationsDbBackup = path.join(EDDATA_BACKUP_DIR, '/locations.db')
  const pathToTradeDbBackup = path.join(EDDATA_BACKUP_DIR, 'trade.db')
  const pathToStationsDbBackup = path.join(EDDATA_BACKUP_DIR, 'stations.db')
  const pathToSystemsDbBackup = path.join(EDDATA_BACKUP_DIR, 'systems.db')

  const dataDirSizeInBytes = (os.platform() !== 'win32') ? getFolderSizeSync(EDDATA_DATA_DIR) : 0
  const freeDiskSpaceInBytes = (await checkDiskSpace(EDDATA_BACKUP_DIR)).free

  writeBackupLog('Checking disk space')
  // Note: fastFolderSize working on Linux and Mac but not Windows
  if (os.platform() !== 'win32') {
    writeBackupLog(`Total data size: ${byteSize(dataDirSizeInBytes)} (${dataDirSizeInBytes} bytes)`)
  }
  writeBackupLog(`Free disk space on backup volume: ${byteSize(freeDiskSpaceInBytes)} (${freeDiskSpaceInBytes} bytes)`)

  if (dataDirSizeInBytes > freeDiskSpaceInBytes) { throw Error('Insufficent free disk space to perform backup') }

  console.time('Backup complete')
  writeBackupLog(`Creating backups in ${EDDATA_BACKUP_DIR}`)

  writeBackupLog(`Backing up ${path.basename(pathToLocationsDbBackup)}`)
  backupDatabase(locationsDb, pathToLocationsDbBackup)
  verifyResults.push(verifyBackup(pathToLocationsDbBackup, ['locations'], TEN_KB_IN_BYTES))

  writeBackupLog(`Backing up ${path.basename(pathToTradeDbBackup)}`)
  backupDatabase(tradeDb, pathToTradeDbBackup)
  verifyResults.push(verifyBackup(pathToTradeDbBackup, ['commodities'], TEN_MB_IN_BYTES))

  writeBackupLog(`Backing up ${path.basename(pathToStationsDbBackup)}`)
  backupDatabase(stationsDb, pathToStationsDbBackup)
  verifyResults.push(verifyBackup(pathToStationsDbBackup, ['stations'], TEN_MB_IN_BYTES))

  writeBackupLog(`Backing up ${path.basename(pathToSystemsDbBackup)}`)
  backupDatabase(systemsDb, pathToSystemsDbBackup)
  verifyResults.push(verifyBackup(pathToSystemsDbBackup, ['systems'], TEN_MB_IN_BYTES))

  console.timeEnd('Backup complete')
  writeBackupLog(`Completed backup at ${new Date().toISOString()}`)

  // Save backup report to both backup dir and live data dir
  const backupReport = {
    started,
    completed: new Date().toISOString(),
    dataDir: EDDATA_DATA_DIR,
    backupDir: EDDATA_BACKUP_DIR,
    pathToSystemsDbBackup,
    pathToLocationsDbBackup,
    pathToTradeDbBackup,
    pathToStationsDbBackup,
    dataDirSizeInBytes,
    freeDiskSpaceInBytes,
    databases: verifyResults,
    timestamp: new Date().toISOString()
  }
  fs.writeFileSync(path.join(EDDATA_DATA_DIR, 'backup.json'), JSON.stringify(backupReport, null, 2))
  fs.writeFileSync(path.join(EDDATA_BACKUP_DIR, 'backup.json'), JSON.stringify(backupReport, null, 2))

  process.exit()
})()
