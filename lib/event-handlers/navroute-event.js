const crypto = require('crypto')
const { systemsDb } = require('../db')
const { SYSTEM_GRID_SIZE, SYSTEM_SECTOR_HASH_LENGTH } = require('../consts')

const selectSystemByAddress = systemsDb.prepare(`
  SELECT * FROM systems WHERE systemAddress = @systemAddress
`)

const insertOrReplaceSystem = systemsDb.prepare(`
  INSERT OR REPLACE INTO systems (
    systemAddress,
    systemName,
    systemX,
    systemY,
    systemZ,
    systemSector,
    updatedAt
  ) VALUES (
    @systemAddress,
    @systemName,
    @systemX,
    @systemY,
    @systemZ,
    @systemSector,
    @updatedAt
  )
`)

module.exports = (payload) => {
  const route = payload.message.Route

  route.forEach(system => {
    // Ignore systems submitted to without valid positions.
    // This should never happen.
    if ((system?.StarPos?.[0] ?? 0) === 0 &&
        (system?.StarPos?.[1] ?? 0) === 0 &&
        (system?.StarPos?.[2] ?? 0) === 0 &&
        (system.SystemName !== 'Sol')) { return }

    const systemAddress = system.SystemAddress
    const systemName = system.StarSystem
    // const starClass = payload.message.StarClass // TODO Add Star Class info to Systems DB
    const systemXGrid = Math.floor(system.StarPos[0] / SYSTEM_GRID_SIZE)
    const systemYGrid = Math.floor(system.StarPos[1] / SYSTEM_GRID_SIZE)
    const systemZGrid = Math.floor(system.StarPos[2] / SYSTEM_GRID_SIZE)
    const systemSector = crypto.createHash('shake256', { outputLength: SYSTEM_SECTOR_HASH_LENGTH })
      .update(`${systemXGrid}, ${systemYGrid}, ${systemZGrid}`)
      .digest('hex')

    if (!selectSystemByAddress.get({ systemAddress })) {
      insertOrReplaceSystem.run({
        systemAddress,
        systemName,
        systemX: system.StarPos[0],
        systemY: system.StarPos[1],
        systemZ: system.StarPos[2],
        systemSector,
        updatedAt: new Date().toISOString()
      })
    }
  })
}
