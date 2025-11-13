const crypto = require('crypto')
const { update, insertOrReplaceInto } = require('../sql-helper')
const { systemsDb, locationsDb, stationsDb } = require('../db')
const { SYSTEM_GRID_SIZE, SYSTEM_SECTOR_HASH_LENGTH } = require('../consts')

const selectSystemByAddress = systemsDb.prepare(`
  SELECT * FROM systems WHERE systemAddress = @systemAddress
`)

const selectStationByMarketId = stationsDb.prepare(`
  SELECT * FROM stations WHERE marketId = @marketId
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
  // const starClass = payload.message.StarClass // TODO Add Star Class info to Systems DB
  const systemXGrid = Math.floor(approachSettlementEvent.StarPos[0] / SYSTEM_GRID_SIZE)
  const systemYGrid = Math.floor(approachSettlementEvent.StarPos[1] / SYSTEM_GRID_SIZE)
  const systemZGrid = Math.floor(approachSettlementEvent.StarPos[2] / SYSTEM_GRID_SIZE)
  const systemSector = crypto.createHash('shake256', { outputLength: SYSTEM_SECTOR_HASH_LENGTH })
    .update(`${systemXGrid}, ${systemYGrid}, ${systemZGrid}`)
    .digest('hex')

  // Add system if it doesn't exist (it should, but in case it's missing for any reason!)
  if (!selectSystemByAddress.get({ systemAddress })) {
    insertOrReplaceSystem.run({
      systemAddress,
      systemName,
      systemX: approachSettlementEvent.StarPos[0],
      systemY: approachSettlementEvent.StarPos[1],
      systemZ: approachSettlementEvent.StarPos[2],
      systemSector,
      updatedAt: new Date().toISOString()
    })
  }

  const newItem = {
    systemAddress,
    systemName,
    systemX: approachSettlementEvent.StarPos[0],
    systemY: approachSettlementEvent.StarPos[1],
    systemZ: approachSettlementEvent.StarPos[2],
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
      // If station exists, update it with new info. This tries to avoid
      // replacing an entry that may exist already, while still enriching it
      // with other info, like lat/long info that is only approach events.
      update(stationsDb, 'stations', newItem, 'marketId = @marketId')
    } else {
      // If station does not seem to exist, insert it
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
