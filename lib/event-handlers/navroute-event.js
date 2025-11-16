const { systemsDb } = require('../db')
const { insertOrReplaceInto } = require('../sql-helper')
const { getSystemSector } = require('../system-sectors')

const selectSystemByAddress = systemsDb.prepare(`
  SELECT * FROM systems WHERE systemAddress = @systemAddress
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

    if (!selectSystemByAddress.get({ systemAddress })) {
      insertOrReplaceInto(systemsDb, 'systems', {
        systemAddress,
        systemName,
        systemX: system.StarPos[0],
        systemY: system.StarPos[1],
        systemZ: system.StarPos[2],
        systemSector: getSystemSector(systemName),
        updatedAt: new Date().toISOString()
      })
    }
  })
}
