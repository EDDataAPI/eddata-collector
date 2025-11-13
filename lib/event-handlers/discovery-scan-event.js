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
  const systemAddress = payload.message.SystemAddress

  // Ignore systems submitted to EDDN without XYZ positions
  if ((payload.message?.StarPos?.[0] ?? 0) === 0 &&
      (payload.message?.StarPos?.[1] ?? 0) === 0 &&
      (payload.message?.StarPos?.[2] ?? 0) === 0 &&
      (payload.message.SystemName !== 'Sol')) { return }

  const system = selectSystemByAddress.get({ systemAddress })

  const systemXGrid = Math.floor(payload.message.StarPos[0] / SYSTEM_GRID_SIZE)
  const systemYGrid = Math.floor(payload.message.StarPos[1] / SYSTEM_GRID_SIZE)
  const systemZGrid = Math.floor(payload.message.StarPos[2] / SYSTEM_GRID_SIZE)
  const systemSector = crypto.createHash('shake256', { outputLength: SYSTEM_SECTOR_HASH_LENGTH })
    .update(`${systemXGrid}, ${systemYGrid}, ${systemZGrid}`)
    .digest('hex')

  if (!system) {
    insertOrReplaceSystem.run({
      systemAddress,
      systemName: payload.message.SystemName,
      systemX: payload.message.StarPos[0],
      systemY: payload.message.StarPos[1],
      systemZ: payload.message.StarPos[2],
      systemSector,
      updatedAt: new Date().toISOString()
    })
  }
}
