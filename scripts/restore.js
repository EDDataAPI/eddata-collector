const path = require('path')
const fs = require('fs')

const {
  EDDATA_DATA_DIR,
  EDDATA_BACKUP_DIR
} = require('../lib/consts')

;(async () => {
  console.log(`Backup location: ${EDDATA_BACKUP_DIR}`)
  console.log(`Target location: ${EDDATA_DATA_DIR}`)
  console.log('Restoring from backup …')

  console.time('Backups restored')

  const pathToLocationsDbBackup = path.join(EDDATA_BACKUP_DIR, '/locations.db')
  const pathToLocationsDbLive = path.join(EDDATA_DATA_DIR, '/locations.db')

  const pathToTradeDbBackup = path.join(EDDATA_BACKUP_DIR, '/trade.db')
  const pathToTradeDbLive = path.join(EDDATA_DATA_DIR, '/trade.db')

  const pathToStationsDbBackup = path.join(EDDATA_BACKUP_DIR, '/stations.db')
  const pathToStationsLive = path.join(EDDATA_DATA_DIR, '/stations.db')

  const pathToSystemsDbBackup = path.join(EDDATA_BACKUP_DIR, '/systems.db')
  const pathToSystemsDbLive = path.join(EDDATA_DATA_DIR, '/systems.db')

  if (!fs.existsSync(EDDATA_DATA_DIR)) { fs.mkdirSync(EDDATA_DATA_DIR, { recursive: true }) }

  restoreDatabaseFromBackup(pathToLocationsDbBackup, pathToLocationsDbLive)
  restoreDatabaseFromBackup(pathToTradeDbBackup, pathToTradeDbLive)
  restoreDatabaseFromBackup(pathToStationsDbBackup, pathToStationsLive)
  restoreDatabaseFromBackup(pathToSystemsDbBackup, pathToSystemsDbLive)

  console.timeEnd('Backups restored')

  process.exit()
})()

function restoreDatabaseFromBackup (dbToRestoreFrom, dbToRestoreTo) {
  // Delete existing files in target location
  fs.rmSync(dbToRestoreTo, { force: true })
  fs.rmSync(`${dbToRestoreTo}-journal}`, { force: true })
  fs.rmSync(`${dbToRestoreTo}-shm`, { force: true })
  fs.rmSync(`${dbToRestoreTo}-wal`, { force: true })

  // Copy file from backup to live data dir
  // Note: Backup files are always single files (they are pre-vaccumed)
  fs.copyFileSync(dbToRestoreFrom, dbToRestoreTo)
}
