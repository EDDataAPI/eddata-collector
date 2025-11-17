const { stationsDb } = require('../../db')
const { update, insertOrReplaceInto } = require('../../sql-helper')
const stationTypes = require('../../station-types')

const selectStationByMarketId = stationsDb.prepare(`
  SELECT * FROM stations WHERE marketId = @marketId
`)

module.exports = (payload) => {
  const { message } = payload

  if (!message?.MarketID) {
    // Only instances I can find this for relate to some megaships
    console.error('Docked Event Missing Market ID', message)
    return
  }

  let stationName = message?.StationName
  let stationType = message?.StationType
  let primaryEconomy = message?.StationEconomies?.[0]?.Name.replace('$economy_', '').replace(';', '') ?? null
  let secondaryEconomy = message?.StationEconomies?.[1]?.Name.replace('$economy_', '').replace(';', '') ?? null
  const isFleetCarrier = stationName.match('^[A-Z0-9]{3}-[A-Z0-9]{3}$')

  if (isFleetCarrier) {
    stationType = 'FleetCarrier'
    primaryEconomy = null
  }

  if (primaryEconomy === 'Agri') primaryEconomy = 'Agriculture'
  if (secondaryEconomy === 'Agri') secondaryEconomy = 'Agriculture'

  if (primaryEconomy === 'High Tech') primaryEconomy = 'HighTech'
  if (secondaryEconomy === 'High Tech') secondaryEconomy = 'HighTech'

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

  if (!stationTypes.includes(stationType)) {
    console.warn(`Unknown Station Type: ${message?.StationType} ("${message?.StationName}" in "${message?.StarSystem}")`)
  }

  let maxLandingPadSize
  if (message?.LandingPads?.Small > 0) maxLandingPadSize = 1
  if (message?.LandingPads?.Medium > 0) maxLandingPadSize = 2
  if (message?.LandingPads?.Large > 0) maxLandingPadSize = 3

  // This is to handle message wher the LandingPads information is missing
  if (!maxLandingPadSize) {
    if (message?.StationType === 'Outpost') {
      maxLandingPadSize = 2 // All Outposts support up to medium pads only
    } else if (stationTypes.includes(stationType) && stationType !== 'OnFootSettlement') {
      // If it's a known station type AND it's not an Outpost or an Odyssey Settlement then
      // it supports large landing pads. Odyssey Settlements CAN support large landing pads,
      // but the don't all support them (they can be small or medium only) so we don't make
      // any assumptions about them, but we can for other station types.
      maxLandingPadSize = 3
    }
  }

  const stationData = {
    marketId: message?.MarketID,
    stationName,
    distanceToArrival: message?.DistFromStarLS ?? null,
    stationType,
    allegiance: isFleetCarrier ? null : message?.StationAllegiance ?? null,
    government: isFleetCarrier ? null : message?.StationGovernment.replace('$government_', '').replace(';', '') ?? null,
    controllingFaction: isFleetCarrier ? null : message?.StationFaction?.Name ?? null,
    primaryEconomy,
    secondaryEconomy,
    shipyard: message?.StationServices.includes('shipyard') ? 1 : 0,
    outfitting: message?.StationServices.includes('outfitting') ? 1 : 0,
    blackMarket: message?.StationServices.includes('blackmarket') ? 1 : 0,
    contacts: message?.StationServices.includes('contacts') ? 1 : 0,
    crewLounge: message?.StationServices.includes('crewlounge') ? 1 : 0,
    interstellarFactors: message?.StationServices.includes('facilitator') ? 1 : 0,
    materialTrader: message?.StationServices.includes('materialtrader') ? 1 : 0,
    missions: message?.StationServices.includes('missions') ? 1 : 0,
    refuel: message?.StationServices.includes('refuel') ? 1 : 0,
    repair: message?.StationServices.includes('repair') ? 1 : 0,
    restock: message?.StationServices.includes('restock') ? 1 : 0,
    searchAndRescue: message?.StationServices.includes('searchrescue') ? 1 : 0,
    technologyBroker: message?.StationServices.includes('techBroker') ? 1 : 0,
    tuning: message?.StationServices.includes('tuning') ? 1 : 0,
    universalCartographics: message?.StationServices.includes('exploration') ? 1 : 0,
    engineer: message?.StationServices.includes('engineer') ? 1 : 0,
    frontlineSolutions: message?.StationServices.includes('frontlinesolutions') ? 1 : 0,
    apexInterstellar: message?.StationServices.includes('apexinterstellar') ? 1 : 0,
    vistaGenomics: message?.StationServices.includes('vistagenomics') ? 1 : 0,
    pioneerSupplies: message?.StationServices.includes('pioneersupplies') ? 1 : 0,
    bartender: message?.StationServices.includes('bartender') ? 1 : 0,
    prohibited: message?.Prohibited && Array.isArray(message.Prohibited) && message.Prohibited.length > 0
      ? JSON.stringify(message.Prohibited)
      : null,
    carrierDockingAccess: message?.CarrierDockingAccess || null,
    systemAddress: message?.SystemAddress,
    systemName: message?.StarSystem,
    systemX: message?.StarPos[0] ?? null,
    systemY: message?.StarPos[1] ?? null,
    systemZ: message?.StarPos[2] ?? null,
    maxLandingPadSize,
    updatedAt: new Date().toISOString()
  }

  // Somehow data without LandingPads info is (rarely) coming through but other
  // data seems fine. It might be from old and/or buggy software.
  if (maxLandingPadSize) stationData.maxLandingPadSize = maxLandingPadSize

  if (selectStationByMarketId.get({ marketId: message?.MarketID })) {
    update(stationsDb, 'stations', stationData, 'marketId = @marketId')
  } else {
    insertOrReplaceInto(stationsDb, 'stations', stationData)
  }
}
