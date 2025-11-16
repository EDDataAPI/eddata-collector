const { systemsDb } = require('../../db')
const { insertOrReplaceInto } = require('../../sql-helper')
const { getSystemSector } = require('../../system-sectors')

module.exports = (payload) => {
  const { message } = payload

  if (!message?.SystemAddress) {
    console.error('Location Event Missing System Address', message)
    return
  }

  const systemData = {
    systemAddress: message.SystemAddress,
    systemName: message.StarSystem,
    systemX: message.StarPos?.[0] ?? null,
    systemY: message.StarPos?.[1] ?? null,
    systemZ: message.StarPos?.[2] ?? null,
    systemSector: getSystemSector(message.StarSystem),
    updatedAt: new Date(message.timestamp).toISOString()
  }

  insertOrReplaceInto(systemsDb, 'systems', systemData)
}
