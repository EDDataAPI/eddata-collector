const fs = require('fs')
const crypto = require('crypto')

module.exports = async (pathToFile, algorithm = 'sha256') => {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const rs = fs.createReadStream(pathToFile)
    rs.on('error', reject)
    rs.on('data', chunk => hash.update(chunk))
    rs.on('end', () => resolve(hash.digest('hex')))
  })
}
