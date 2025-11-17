# Database Schema Changes - API/WWW Migration Guide

**Date:** November 17, 2025  
**Version:** After TODO #6 (Station Schema Extension)

---

## 📋 Summary

This document lists all database changes that need to be considered in the API and WWW frontend.

---

## 🗄️ Schema Changes

### Station Schema (`stations.db` - `stations` Table)

#### New Columns

| Column | Type | NULL? | Description | Example Value |
|--------|------|-------|-------------|---------------|
| `prohibited` | TEXT | Yes | JSON array of prohibited commodities | `["OnionHeadC", "Slaves"]` |
| `carrierDockingAccess` | TEXT | Yes | Fleet Carrier docking access level | `"all"`, `"squadronFriends"`, `"none"` |

#### Details

**1. `prohibited` (TEXT, NULL)**
- **Format:** JSON string of an array
- **Source:** EDDN Commodity Events (CAPI data only)
- **Usage:** 
  ```javascript
  const prohibited = JSON.parse(station.prohibited || '[]')
  ```
- **Possible Values:**
  - `null` - No data available or no prohibitions
  - `["OnionHeadC"]` - Onionhead (Variant C) prohibited
  - `["Slaves", "ImperialSlaves"]` - Slaves prohibited
  - `[]` - Empty array (should be NULL, but possible)

**2. `carrierDockingAccess` (TEXT, NULL)**
- **Format:** String enum
- **Source:** EDDN Commodity Events, Docked Events
- **Possible Values:**
  - `null` - Not a Fleet Carrier or data not available
  - `"all"` - Accessible to all players
  - `"squadronFriends"` - Squadron & Friends only
  - `"none"` - No one can dock

---

## 📊 New Stats Files

### 1. `commodity-ticker.json` (NEW - since TODO #5)

**Path:** `stats/commodity-ticker.json`

**Structure:**
```json
{
  "hotTrades": [
    {
      "commodity": "Painite",
      "profit": 145000,
      "profitPercent": 67.5,
      "buy": {
        "marketId": 3228783872,
        "price": 215000,
        "stock": 500
      },
      "sell": {
        "marketId": 3228844544,
        "price": 360000,
        "demand": 300
      }
    }
  ],
  "highValue": [
    {
      "commodity": "LowTemperatureDiamonds",
      "maxPrice": 650000,
      "markets": 42,
      "demand": 15000
    }
  ],
  "mostActive": [
    {
      "commodity": "Tritium",
      "activeMarkets": 156,
      "avgBuyPrice": 45000,
      "avgSellPrice": 48000,
      "totalStock": 250000,
      "totalDemand": 180000
    }
  ],
  "timestamp": "2025-11-17T12:22:42.719Z"
}
```

**Categories:**

#### Hot Trades (Top 20)
- **Purpose:** Best current trading opportunities
- **Sorting:** By absolute profit (highest first)
- **Filter:** Minimum 100 units stock AND demand
- **Use Case:** "Where can I make the most profit right now?"

#### High Value (Top 10)
- **Purpose:** Luxury goods with highest prices
- **Sorting:** By maxPrice (highest first)
- **Use Case:** "Which commodities are most valuable?"

#### Most Active (Top 10)
- **Purpose:** Most traded commodities (24h)
- **Sorting:** By number of active markets
- **Use Case:** "What is being traded most frequently right now?"

**Update Frequency:** Hourly (0 * * * *)

---

## 🔄 API Endpoint Changes

### Existing Endpoints - Extended Data

#### `GET /stations/:marketId`
```javascript
// BEFORE
{
  "marketId": 3228783872,
  "stationName": "Jameson Memorial",
  "systemName": "Shinrarta Dezhra",
  // ... other fields
}

// AFTER (new fields)
{
  "marketId": 3228783872,
  "stationName": "Jameson Memorial",
  "systemName": "Shinrarta Dezhra",
  // ... other fields
  "prohibited": ["OnionHeadC", "Slaves"],           // NEW
  "carrierDockingAccess": null                      // NEW (not a Fleet Carrier)
}
```

#### `GET /stations?type=FleetCarrier`
```javascript
// Fleet Carrier example
{
  "marketId": 3700005632,
  "stationName": "X7F-09N",
  "stationType": "Fleet Carrier",
  "systemName": "Sol",
  // ... other fields
  "prohibited": null,
  "carrierDockingAccess": "squadronFriends"         // NEW - important for Carriers!
}
```

### New Endpoints (Recommended)

#### `GET /stats/ticker` (NEW)
```javascript
// Retrieve commodity ticker
{
  "hotTrades": [...],
  "highValue": [...],
  "mostActive": [...],
  "timestamp": "2025-11-17T12:22:42.719Z"
}
```

#### `GET /stations/:marketId/prohibited` (Optional)
```javascript
// Only prohibited commodities of a station
{
  "marketId": 3228783872,
  "prohibited": ["OnionHeadC", "Slaves"]
}
```

---

## 🎨 WWW Frontend Adjustments

### 1. Station Details Page

**New Sections:**

#### Prohibited Commodities
```html
<!-- If prohibited is present -->
<div class="prohibited-section">
  <h3>🚫 Prohibited Commodities</h3>
  <ul>
    <li>Onionhead (Variant C)</li>
    <li>Slaves</li>
  </ul>
</div>
```

**CSS Classes:**
```css
.prohibited-section {
  background: #ffe6e6;
  border-left: 4px solid #cc0000;
  padding: 1rem;
}
```

#### Fleet Carrier Docking Access
```html
<!-- Only show for Fleet Carriers -->
<div class="carrier-access">
  <h3>🚁 Docking Access</h3>
  <span class="access-badge access-squadronFriends">
    Squadron & Friends
  </span>
</div>
```

**Badge-Styles:**
```css
.access-all {
  background: #4caf50;
  color: white;
}

.access-squadronFriends {
  background: #ff9800;
  color: white;
}

.access-none {
  background: #f44336;
  color: white;
}
```

### 2. Trading Dashboard (NEW)

**Commodity Ticker Widget:**

```html
<div class="ticker-widget">
  <h2>🔥 Hot Trades</h2>
  <div class="trade-opportunity">
    <div class="commodity-name">Painite</div>
    <div class="profit">+145,000 CR (67.5%)</div>
    <div class="route">
      <span class="buy">Buy @ Station A (215k)</span>
      →
      <span class="sell">Sell @ Station B (360k)</span>
    </div>
    <div class="stock-info">
      Stock: 500 | Demand: 300
    </div>
  </div>
</div>
```

### 3. Fleet Carrier Filter

**New Filter Option:**
```html
<select id="carrier-access-filter">
  <option value="">All</option>
  <option value="all">Publicly Accessible</option>
  <option value="squadronFriends">Squadron & Friends</option>
  <option value="none">Private</option>
</select>
```

---

## 🔍 SQL Queries for API

### Stations with Prohibited Commodities

```sql
-- All stations with prohibitions
SELECT marketId, stationName, systemName, prohibited
FROM stations
WHERE prohibited IS NOT NULL;
```

### Filter Fleet Carriers by Access

```sql
-- Publicly accessible Fleet Carriers
SELECT marketId, stationName, systemName, carrierDockingAccess
FROM stations
WHERE stationType = 'Fleet Carrier'
AND carrierDockingAccess = 'all';
```

### Process Prohibited Commodities

```javascript
// JavaScript (Node.js)
const stations = db.prepare(`
  SELECT marketId, stationName, prohibited
  FROM stations
  WHERE prohibited IS NOT NULL
`).all()

const result = stations.map(station => ({
  ...station,
  prohibited: JSON.parse(station.prohibited)
}))
```

---

## ⚠️ Important Notes

### NULL Handling

**All new fields are NULL-safe:**
```javascript
// ALWAYS check before JSON.parse()
const prohibited = station.prohibited 
  ? JSON.parse(station.prohibited) 
  : []

const access = station.carrierDockingAccess || 'unknown'
```

### Data Availability

**`prohibited`:**
- ✅ Available: When EDDN Commodity Event from CAPI source
- ❌ Not available: Journal `Market.json` does NOT contain this data
- **Expectation:** Only present in ~10-20% of stations

**`carrierDockingAccess`:**
- ✅ Available: For Fleet Carriers with EDDN Commodity/Docked Events
- ❌ Not available: For regular stations, older data
- **Expectation:** Only for Fleet Carrier entries, not all

### Performance Considerations

**JSON Parsing:**
```javascript
// ❌ SLOW - Parses on every query
app.get('/stations', (req, res) => {
  const stations = db.prepare('SELECT * FROM stations').all()
  const result = stations.map(s => ({
    ...s,
    prohibited: s.prohibited ? JSON.parse(s.prohibited) : []
  }))
  res.json(result)
})

// ✅ BETTER - Only when necessary
app.get('/stations/:id', (req, res) => {
  const station = db.prepare('SELECT * FROM stations WHERE marketId = ?').get(req.params.id)
  if (station.prohibited) {
    station.prohibited = JSON.parse(station.prohibited)
  }
  res.json(station)
})
```

---

## 📈 Migration Timeline

### Phase 1: Database (✅ COMPLETED)
- Schema migration with `migrateSchema()`
- Event handlers updated
- Tests successful

### Phase 2: API (TODO)
- [ ] Extend response schemas
- [ ] Implement NULL handling
- [ ] Optimize JSON parsing
- [ ] New endpoints for ticker

### Phase 3: WWW Frontend (TODO)
- [ ] Extend station details components
- [ ] Prohibited badge design
- [ ] Fleet Carrier access indicator
- [ ] Trading dashboard with ticker
- [ ] Filter for carrierDockingAccess

### Phase 4: Documentation (TODO)
- [ ] Update API documentation
- [ ] Extend OpenAPI/Swagger schema
- [ ] Document example requests

---

## 🧪 Test Data

### Example Queries for Development

```sql
-- Find station with prohibited
SELECT * FROM stations WHERE prohibited IS NOT NULL LIMIT 1;

-- Find Fleet Carrier with access level
SELECT * FROM stations 
WHERE stationType = 'Fleet Carrier' 
AND carrierDockingAccess IS NOT NULL 
LIMIT 5;

-- Statistics: How many stations have data?
SELECT 
  COUNT(*) AS total,
  COUNT(prohibited) AS withProhibited,
  COUNT(carrierDockingAccess) AS withCarrierAccess
FROM stations;
```

### Mock Data for Frontend Tests

```javascript
// Example station with all fields
const mockStation = {
  marketId: 3228783872,
  stationName: "Jameson Memorial",
  systemName: "Shinrarta Dezhra",
  stationType: "Coriolis Starport",
  prohibited: ["OnionHeadC", "Slaves"],
  carrierDockingAccess: null,
  // ... other fields
}

// Example Fleet Carrier
const mockCarrier = {
  marketId: 3700005632,
  stationName: "X7F-09N",
  systemName: "Sol",
  stationType: "Fleet Carrier",
  prohibited: null,
  carrierDockingAccess: "squadronFriends",
  // ... other fields
}
```

---

## 📚 References

- **EDDN Commodity Schema:** https://github.com/EDCD/EDDN/blob/master/schemas/commodity-v3.0.json
- **EDDN Journal Schema:** https://github.com/EDCD/EDDN/blob/master/schemas/journal-v1.0.json
- **Commodity Ticker Documentation:** `docs/COMMODITY-TICKER.md`
- **Database Snapshots:** `docs/DATABASE-SNAPSHOTS.md`

---

**Created:** November 17, 2025  
**Last Updated:** November 17, 2025  
**Contact:** EDDataAPI Team
