const crypto = require('crypto')
const { insertOrReplaceInto } = require('../sql-helper')
const { systemsDb, locationsDb, stationsDb } = require('../db')
const { getSystemSector } = require('../system-sectors')

const selectSystemByAddress = systemsDb.prepare(`
  SELECT * FROM systems WHERE systemAddress = @systemAddress
`)

const selectStationByMarketId = stationsDb.prepare(`
  SELECT * FROM stations WHERE marketId = @marketId
`)

module.exports = (payload) => {
  const approachSettlementEvent = payload.message

  // Ignore systems submitted to without valid positions.
  // This should never happen.
  if ((approachSettlementEvent?.StarPos?.[0] ?? 0) === 0 &&
      (approachSettlementEvent?.StarPos?.[1] ?? 0) === 0 &&
      (approachSettlementEvent?.StarPos?.[2] ?? 0) === 0 &&
      (approachSettlementEvent.SystemName !== 'Sol')) { return }

  const stationName = approachSettlementEvent.Name
  const systemAddress = approachSettlementEvent.SystemAddress
  const systemName = approachSettlementEvent.StarSystem
  const systemX = approachSettlementEvent.StarPos[0]
  const systemY = approachSettlementEvent.StarPos[1]
  const systemZ = approachSettlementEvent.StarPos[2]

  // Add system if it doesn't exist (it should, but in case it's missing for any reason!)
  if (!selectSystemByAddress.get({ systemAddress })) {
    insertOrReplaceInto(systemsDb, 'systems', {
      systemAddress,
      systemName,
      systemX,
      systemY,
      systemZ,
      systemSector: getSystemSector(systemName),
      updatedAt: new Date().toISOString()
    })
  }

  const newItem = {
    systemAddress,
    systemName,
    systemX,
    systemY,
    systemZ,
    bodyId: approachSettlementEvent.BodyID,
    bodyName: approachSettlementEvent.BodyName,
    latitude: approachSettlementEvent.Latitude,
    longitude: approachSettlementEvent.Longitude,
    updatedAt: new Date().toISOString()
  }

  if (approachSettlementEvent?.MarketID) {
    // If has Market ID log to list of stations
    newItem.marketId = approachSettlementEvent.MarketID
    newItem.stationName = stationName

    if (selectStationByMarketId.get({ marketId: approachSettlementEvent.MarketID })) {
      // If station exists, update it with body/location info from approach event
      insertOrReplaceInto(stationsDb, 'stations', newItem)
    } else {
      // If station does not exist, insert it
      insertOrReplaceInto(stationsDb, 'stations', newItem)
    }
  } else {
    // If does not have Market ID (e.g. is a tourist location, Guardian site,
    // etc) then log to list of interesting locations. We generate a hash from
    // a compound key so we have some sort of unique identifer for them.
    newItem.locationName = stationName

    // These started appearing since the Trailblazer update, but are not interesting POI
    if (newItem.locationName.startsWith('Planetary Construction Site :')) return

    newItem.locationId = crypto.createHash('shake256', { outputLength: 8 })
      .update(`${newItem.systemAddress}/${newItem.locationName}/${newItem.bodyId}/${newItem.latitude}/${newItem.longitude}`)
      .digest('hex')

    insertOrReplaceInto(locationsDb, 'locations', newItem)
  }
}
