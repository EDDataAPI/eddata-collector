const path = require('path')
const fs = require('fs')
const byteSize = require('byte-size')
const SqlLiteDatabase = require('better-sqlite3')

const {
  EDDATA_BACKUP_LOG
} = require('../lib/consts')

const MIN_ROWS_EXPECTED = 1000

function writeBackupLog (text, reset = false) {
  const line = `${new Date().toISOString()}: ${text}\n`
  if (reset === true || !fs.existsSync(EDDATA_BACKUP_LOG)) {
    fs.writeFileSync(EDDATA_BACKUP_LOG, line)
  } else {
    fs.appendFileSync(EDDATA_BACKUP_LOG, line)
  }
}

function backupDatabase (dbToBackup, pathToBackupTargetLocation) {
  console.log(`Backing up ${path.basename(pathToBackupTargetLocation)} …`)
  console.time(`Backed up ${path.basename(pathToBackupTargetLocation)}`)
  fs.rmSync(pathToBackupTargetLocation, { force: true })
  fs.rmSync(`${pathToBackupTargetLocation}-journal}`, { force: true })
  fs.rmSync(`${pathToBackupTargetLocation}-shm`, { force: true })
  fs.rmSync(`${pathToBackupTargetLocation}-wal`, { force: true })
  dbToBackup.exec(`VACUUM INTO '${pathToBackupTargetLocation}'`)
  console.timeEnd(`Backed up ${path.basename(pathToBackupTargetLocation)}`)
}

function verifyBackup (pathToBackupTargetLocation, tables, minDbSizeInBytes) {
  console.time(`Verified backup of ${path.basename(pathToBackupTargetLocation)}`)
  const stats = fs.statSync(pathToBackupTargetLocation, { bigint: false })
  const dbSize = Number(stats.size)
  writeBackupLog(`Backup of ${path.basename(pathToBackupTargetLocation)} is ${byteSize(dbSize)} (${dbSize} bytes)`)
  if (dbSize < minDbSizeInBytes) { console.warn(`WARNING: ${pathToBackupTargetLocation} file size smaller than expected`) }

  // Open connection to DB and set Write Ahead Log mode on it
  const db = new SqlLiteDatabase(pathToBackupTargetLocation)
  db.pragma('journal_mode = WAL')

  const result = {
    name: path.basename(pathToBackupTargetLocation),
    size: dbSize,
    tables: {}
  }

  for (const table of tables) {
    const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count
    result.tables[table] = rowCount
    writeBackupLog(`Backup of ${pathToBackupTargetLocation} table '${table}' has ${rowCount.toLocaleString('en-GB')} entries`)
    if (rowCount < MIN_ROWS_EXPECTED) { console.warn(`WARNING: ${pathToBackupTargetLocation} row count for '${table}' smaller than expected`) }
  }

  db.close()
  console.timeEnd(`Verified backup of ${path.basename(pathToBackupTargetLocation)}`)

  return result
}

module.exports = {
  writeBackupLog,
  backupDatabase,
  verifyBackup
}
