const { stationsDb, tradeDb } = require('../db')
const { insertOrReplaceInto } = require('../sql-helper')

const deleteMarketData = tradeDb.prepare(`
  DELETE FROM commodities WHERE marketId = @marketId
`)

const selectStationByMarketId = stationsDb.prepare(`
  SELECT * FROM stations WHERE marketId = @marketId
`)

module.exports = (payload) => {
  const marketId = payload.message.marketId
  const isFleetCarrier = payload.message.stationName.match('^[A-Z0-9]{3}-[A-Z0-9]{3}$')
  const updatedAt = new Date(payload.message.timestamp).toISOString()
  const updatedAtDay = new Date(payload.message.timestamp).toISOString().split('T')[0]

  if (isFleetCarrier) {
    // As Fleet Carriers move around and can change at any time,
    // delete old commodity data for them when new data comes in.
    deleteMarketData.run({ marketId })
  }

  // Validate the market ID corresponds to a known station and add basic station
  // information if we don't have it already.
  //
  // Note: We don't get information about services or canonical information
  // about what system the station is in (just the non-unique 'name') so entries
  // logged this way will be very basic.
  if (!selectStationByMarketId.get({ marketId })) {
    const stationName = payload.message.stationName
    const stationType = payload.message.stationType
    const prohibited = payload.message.prohibited || null
    addStationToDatabase(marketId, stationName, stationType, prohibited)
  }

  for (const commodity of payload.message.commodities) {
    // Some events have strings strings like '$gold_name;' instead of 'gold',
    // while others send the actual string value (e.g. 'Gold' with a capital G)
    // Don't know if this is a bug in ED Journal and/or in apps sending to EDDN.
    // Regardless, this attempts to resolve the issue by cleaning them up.
    const commodityName = commodity.name
      .toLowerCase()
      .replace(/^\$/, '')
      .replace(/_name;$/, '')

    // Filter out invalid placeholder prices (999999 = no data available)
    // These appear for stations without markets or commodities not traded there
    const buyPrice = (commodity.buyPrice === 999999 || commodity.buyPrice < 0) ? 0 : commodity.buyPrice
    const sellPrice = (commodity.sellPrice === 999999 || commodity.sellPrice < 0) ? 0 : commodity.sellPrice

    const newItem = {
      marketId,
      commodityName,
      buyPrice,
      demand: commodity.demand,
      demandBracket: commodity.demandBracket,
      meanPrice: commodity.meanPrice,
      sellPrice,
      stock: commodity.stock,
      stockBracket: commodity.stockBracket,
      updatedAt,
      updatedAtDay
    }
    insertOrReplaceInto(tradeDb, 'commodities', newItem)
  }
}

// This adds very basic station information in the event there is no data at all
// for a market. As the events contain a non-unique system name but no canonical
// system address (64 bit ID) so we just log what we have that we can be sure of
function addStationToDatabase (marketId, _stationName, _stationType, prohibited = null) {
  let stationName = _stationName
  let stationType = _stationType

  if ( // Ignore System Colonisation Ship (at least for now)
    stationName.startsWith('$EXT_PANEL_ColonisationShip') || stationName === 'System Colonisation Ship'
  ) return

  if ( // Ignore these Colonisation related station types (at least for now)
    stationType === 'GameplayPOI' || stationType === 'DockablePlanetStation'
  ) return

  // There is no offical FDev type for Stronghold Carriers but it's useful to have one
  if (stationName === 'Stronghold Carrier' ||
      stationName === 'Hochburg-Carrier' ||
      stationName === 'Portanaves bastión' ||
      stationName === 'Porte-vaisseaux de forteresse' ||
      stationName === 'Transportadora da potência' ||
      stationName === 'Носитель-база' ||
      stationName.startsWith('$ShipName_StrongholdCarrier')
  ) {
    stationName = 'Stronghold Carrier'
    stationType = 'StrongholdCarrier'
  }

  // Normalise case sensitivity of MegaShip station type
  if (stationType === 'Megaship') stationType = 'MegaShip'

  if (stationName.match('^[A-Z0-9]{3}-[A-Z0-9]{3}$')) stationType = 'FleetCarrier'

  const stationData = {
    marketId,
    stationName,
    updatedAt: new Date().toISOString()
  }

  // Only add stationType if it is defined. This avoids values for station type
  // that are empty strings (they should be NULL if not known).
  if (stationType) stationData.stationType = stationType

  // Add prohibited commodities if available (JSON array from EDDN)
  if (prohibited && Array.isArray(prohibited) && prohibited.length > 0) {
    stationData.prohibited = JSON.stringify(prohibited)
  }

  insertOrReplaceInto(stationsDb, 'stations', stationData)
}
