const path = require('path')
const fs = require('fs')
const getFileHash = require('../lib/utils/get-file-hash')
const byteSize = require('byte-size')
const zlib = require('zlib')
const stream = require('stream')
const { promisify } = require('util')
const pipeline = promisify(stream.pipeline)

const {
  EDDATA_DOWNLOADS_BASE_URL,
  EDDATA_BACKUP_DIR,
  EDDATA_DOWNLOADS_DIR
} = require('../lib/consts')

const pathToBackupDownloadManifest = path.join(EDDATA_DOWNLOADS_DIR, 'downloads.json')

const databasesToBackup = [
  path.join(EDDATA_BACKUP_DIR, '/locations.db'),
  path.join(EDDATA_BACKUP_DIR, '/trade.db'),
  path.join(EDDATA_BACKUP_DIR, '/stations.db'),
  path.join(EDDATA_BACKUP_DIR, '/systems.db')
]

;(async () => {
  console.log('Compressing backups …')
  console.time('Compressed backups')
  const backupDownloadManifest = {}

  for (const pathToDatabase of databasesToBackup) {
    console.log(`Compressing ${path.basename(pathToDatabase)} …`)
    console.time(`Compressed ${path.basename(pathToDatabase)}`)

    // Note: Does not overwrite existing compressed version until the new
    // version has been created so that the switch over is atomic
    const pathToOutput = `${EDDATA_DOWNLOADS_DIR}/${path.basename(pathToDatabase)}.gz`
    const pathToTmpOutput = `${EDDATA_DOWNLOADS_DIR}/${path.basename(pathToDatabase)}.tmp.gz`
    await pipeline(
      fs.createReadStream(pathToDatabase),
      zlib.createGzip({ level: 1 }), // Favour faster compression over smaller files, latter takes way too long for large files
      fs.createWriteStream(pathToTmpOutput)
    )
    fs.renameSync(pathToTmpOutput, pathToOutput)

    const oldStats = fs.statSync(pathToDatabase, { bigint: false })
    const newStats = fs.statSync(pathToOutput, { bigint: false })
    const oldSize = Number(oldStats.size)
    const newSize = Number(newStats.size)
    const created = newStats.ctime
    console.log(`Created ${path.basename(pathToOutput)} (${byteSize(newSize)}), saved ${byteSize(oldSize - newSize)}`)
    console.timeEnd(`Compressed ${path.basename(pathToDatabase)}`)
    try {
      backupDownloadManifest[path.basename(pathToDatabase)] = {
        name: path.basename(pathToDatabase),
        url: `${EDDATA_DOWNLOADS_BASE_URL}/${path.basename(pathToOutput)}`,
        size: newSize,
        created,
        sha256: await getFileHash(pathToOutput)
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Update list of compressed backups avalible for download
  fs.writeFileSync(pathToBackupDownloadManifest, JSON.stringify(backupDownloadManifest, null, 2))
  console.log(`Saved backup download manifest to ${pathToBackupDownloadManifest}`)

  console.timeEnd('Compressed backups')

  process.exit()
})()
