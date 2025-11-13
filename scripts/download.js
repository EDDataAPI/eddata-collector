const fs = require('fs')
const { mkdir, rm } = require('fs/promises')
const { Readable } = require('stream')
const { finished } = require('stream/promises')
const zlib = require('zlib')
const stream = require('stream')
const { promisify } = require('util')
const pipeline = promisify(stream.pipeline)

const path = require('path')
const byteSize = require('byte-size')
const getFileHash = require('../lib/utils/get-file-hash')

const { ARDENT_DATA_DIR } = require('../lib/consts')
const TMP_DOWNLOAD_DIR = path.join(ARDENT_DATA_DIR, 'tmp')
const BACKUP_DOWNLOAD_MANIFEST = 'https://downloads.ardent-insight.com/downloads.json'

async function download (url, pathToDestination) {
  if (fs.existsSync(pathToDestination)) await rm(pathToDestination)
  const res = await fetch(url)
  const fileStream = fs.createWriteStream(pathToDestination, { flags: 'wx' })
  await finished(Readable.fromWeb(res.body).pipe(fileStream))
}

function syncToDataDir (copyFrom, copyTo) {
  fs.rmSync(copyTo, { force: true })
  fs.rmSync(`${copyTo}-journal}`, { force: true })
  fs.rmSync(`${copyTo}-shm`, { force: true })
  fs.rmSync(`${copyTo}-wal`, { force: true })
  fs.renameSync(copyFrom, copyTo)
}

(async () => {
  if (!fs.existsSync(ARDENT_DATA_DIR)) await mkdir(ARDENT_DATA_DIR)
  if (!fs.existsSync(TMP_DOWNLOAD_DIR)) await mkdir(TMP_DOWNLOAD_DIR)
  const res = await fetch(BACKUP_DOWNLOAD_MANIFEST)
  const files = await res.json()

  for (const f in files) {
    const file = files[f]

    const pathToDownload = path.resolve(TMP_DOWNLOAD_DIR, path.basename(file.url))
    const pathToUncompressedFile = path.resolve(TMP_DOWNLOAD_DIR, file.name)

    console.log(`Downloading ${file.url} (${(byteSize(file.size))}) …`)
    console.time(`Downloaded ${path.basename(file.url)}`)
    await download(file.url, pathToDownload)
    console.timeEnd(`Downloaded ${path.basename(file.url)}`)

    const checksum = await getFileHash(pathToDownload)
    if (checksum === file.sha256) {
      console.log(`Checksum verified: ${file.sha256}`)
    } else {
      console.error(`ERROR: Checksum did not match expected value\nExpected: ${file.sha256}\nActual: ${checksum}`)
      continue
    }

    console.log(`Uncompressing ${path.basename(file.url)} …`)
    console.time(`Uncompressed ${path.basename(file.url)}`)
    await pipeline(
      fs.createReadStream(pathToDownload),
      zlib.createGunzip(),
      fs.createWriteStream(pathToUncompressedFile)
    )
    const stats = fs.statSync(pathToUncompressedFile, { bigint: false })
    console.log(`Uncompressed file size is ${(byteSize(Number(stats.size)))}`)
    console.timeEnd(`Uncompressed ${path.basename(file.url)}`)

    console.time(`Saved ${file.name} to ${ARDENT_DATA_DIR}`)
    syncToDataDir(pathToUncompressedFile, path.resolve(ARDENT_DATA_DIR, file.name))
    console.timeEnd(`Saved ${file.name} to ${ARDENT_DATA_DIR}`)
  }
})()
