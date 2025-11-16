const { systemsDb } = require('../db')
const { insertOrReplaceInto } = require('../sql-helper')
const { getSystemSector } = require('../system-sectors')

const selectSystemByAddress = systemsDb.prepare(`
  SELECT * FROM systems WHERE systemAddress = @systemAddress
`)

module.exports = (payload) => {
  const systemAddress = payload.message.SystemAddress

  // Ignore systems submitted to EDDN without XYZ positions
  if ((payload.message?.StarPos?.[0] ?? 0) === 0 &&
      (payload.message?.StarPos?.[1] ?? 0) === 0 &&
      (payload.message?.StarPos?.[2] ?? 0) === 0 &&
      (payload.message.SystemName !== 'Sol')) { return }

  const system = selectSystemByAddress.get({ systemAddress })

  if (!system) {
    insertOrReplaceInto(systemsDb, 'systems', {
      systemAddress,
      systemName: payload.message.SystemName,
      systemX: payload.message.StarPos[0],
      systemY: payload.message.StarPos[1],
      systemZ: payload.message.StarPos[2],
      systemSector: getSystemSector(payload.message.SystemName),
      updatedAt: new Date().toISOString()
    })
  }
}
