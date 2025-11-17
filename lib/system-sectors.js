const { createHash } = require('node:crypto')
const { SYSTEM_GRID_SIZE, SYSTEM_SECTOR_HASH_LENGTH } = require('../lib/consts')

function getSystemSector (x, y, z) {
  const systemXGrid = Math.floor(x / SYSTEM_GRID_SIZE)
  const systemYGrid = Math.floor(y / SYSTEM_GRID_SIZE)
  const systemZGrid = Math.floor(z / SYSTEM_GRID_SIZE)
  return createHash('shake256', { outputLength: SYSTEM_SECTOR_HASH_LENGTH })
    .update(`${systemXGrid}, ${systemYGrid}, ${systemZGrid}`)
    .digest('hex')
}

function getNearbySystemSectors (x, y, z, distance) {
  const minXGridValue = Math.floor((x - distance) / SYSTEM_GRID_SIZE)
  const maxXGridValue = Math.ceil((x + distance) / SYSTEM_GRID_SIZE)
  const xGridValues = _getAllNumbersBetween(minXGridValue, maxXGridValue)

  const minYGridValue = Math.floor((y - distance) / SYSTEM_GRID_SIZE)
  const maxYGridValue = Math.ceil((y + distance) / SYSTEM_GRID_SIZE)
  const yGridValues = _getAllNumbersBetween(minYGridValue, maxYGridValue)

  const minZGridValue = Math.floor((z - distance) / SYSTEM_GRID_SIZE)
  const maxZGridValue = Math.ceil((z + distance) / SYSTEM_GRID_SIZE)
  const zGridValues = _getAllNumbersBetween(minZGridValue, maxZGridValue)

  const nearbySectors = []
  for (const xVal of xGridValues) {
    for (const yVal of yGridValues) {
      for (const zVal of zGridValues) {
        nearbySectors.push(
          createHash('shake256', { outputLength: SYSTEM_SECTOR_HASH_LENGTH })
            .update(`${xVal}, ${yVal}, ${zVal}`)
            .digest('hex')
        )
      }
    }
  }

  return nearbySectors
}

function _getAllNumbersBetween (min, max) {
  const length = max - min + 1
  return Array.from({ length }, (_, i) => min + i)
}

module.exports = {
  getSystemSector,
  getNearbySystemSectors
}
