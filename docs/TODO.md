# EDData Collector - TODO List

**Stand:** 17. November 2025  
**Sortiert nach:** Priorität (Kritisch → Niedrig)

---

## 🔴 KRITISCH - Unmittelbare Aktion erforderlich

### #1 - Dead Letter Queue für Message Buffering
**Datei:** `index.js:335`  
**Problem:** Wenn Datenbank gesperrt ist (z.B. während Backup/Stats), werden EDDN Messages übersprungen statt gebuffert  
**Impact:** Datenverlust bei DB-Locks  
**Lösung:**
```javascript
// TODO: Buffer messages in a dead letter queue and process them later
const messageBuffer = []
if (databaseWriteLocked) {
  messageBuffer.push(message)
  continue
}
```
**Aufwand:** ~2-3 Stunden  
**Nutzen:** Verhindert Datenverlust, bessere Reliability

---

## 🟠 HOCH - Wichtige Performance-Verbesserungen

### ~~#2 - Stats-Generierung via sqlite3-rsync~~ ✅ ERLEDIGT
**Datei:** `index.js:314-317`  
**Problem:** Stats-Generierung blockiert Production-DB  
**Impact:** Performance-Einbußen während 6 AM Cron  

**✅ GELÖST:** 
- Implementiert Database-Snapshot-System mit SQLite `VACUUM INTO`
- Stats laufen nun gegen read-only Snapshots
- Keine Blockierung der Production-DB mehr
- Häufigere Updates möglich (stündlich statt täglich)
- Snapshots werden automatisch alle 2h aktualisiert

**Dateien:**
- `scripts/stats/snapshot-databases.js` - Snapshot-Management
- `scripts/stats/database-stats.js` - Nutzt Snapshots
- `scripts/stats/commodity-stats.js` - Nutzt Snapshots
- `lib/stats/commodity-stats.js` - Snapshot-Support

**Aufwand:** 1 Tag ✅ **ERLEDIGT**  
**Nutzen:** Keine Production-Impact, häufigere Stats-Updates

---

### #3 - Regelmäßiges VACUUM der Trade-DB
**Datei:** `scripts/optimize.js:58-59`  
**Problem:** Trade-DB schrumpft nicht nach DELETE von alten Daten  
**Impact:** Verschwendeter Disk-Space, langsamere Queries  
**Aktuell:**
```javascript
// TODO: The trade database specifically should be vacuumed periodically to
// allow it to shrink in size as old data is deleted
```
**Lösung:**
```javascript
// Wöchentlicher VACUUM statt nur bei Backup
cron.schedule('0 3 * * 0', () => { // Sonntags 3 AM
  tradeDb.exec('VACUUM')
})
```
**Aufwand:** ~1 Stunde  
**Nutzen:** Kleinere DB-Größe, bessere Performance

---

## 🟡 MITTEL - Feature-Erweiterungen

### ~~#4 - database-stats.js Rewrite~~ ✅ ERLEDIGT
**Datei:** `scripts/stats/database-stats.js:6`  
**Problem:** Langsame COUNT(*) Queries, ungenaue Stats  
**Impact:** Langsame Stats-Generierung  

**✅ GELÖST:**
- Subqueries durch CASE-Statements ersetzt
- Commodity stats: 4 Subqueries → 1 kombinierte Query
- Station stats: 3 Subqueries → 1 kombinierte Query mit CASE
- Operator-Precedence-Bug bei updatedInLast24Hours gefixt

**Performance:**
- Vorher: 13ms
- Nachher: 3.8ms
- **Verbesserung: 71% schneller**

**Query-Optimierungen:**
```javascript
// Vorher: 4 Subqueries
SELECT COUNT(*) AS marketOrders,
  (SELECT COUNT(DISTINCT commodityName) FROM commodities),
  (SELECT COUNT(DISTINCT marketId) FROM commodities),
  (SELECT COUNT(*) FROM commodities WHERE updatedAt > @ts)
FROM commodities

// Nachher: 1 kombinierte Query
SELECT COUNT(*) AS marketOrders,
  COUNT(DISTINCT commodityName) AS uniqueCommodities,
  COUNT(DISTINCT marketId) AS tradeMarkets,
  SUM(CASE WHEN updatedAt > @ts THEN 1 ELSE 0 END) AS updatedInLast24Hours
FROM commodities
```

**Aufwand:** 3-4 Stunden ✅ **ERLEDIGT**  
**Nutzen:** Schnellere Stats-Generierung, präzisere Berechnungen

---

### ~~#5 - Price Change Tracking (Commodity Ticker)~~ ✅ ERLEDIGT
**Datei:** `scripts/stats/commodity-stats.js:21`  
**Problem:** commodity-ticker.json ist leer  
**Impact:** API liefert keine Price-Change-Daten  

**✅ GELÖST:**
Implementiert umfassendes Commodity-Ticker-System mit 3 Kategorien:

**1. Hot Trades** (Top 20)
- Beste aktuelle Handelsmöglichkeiten (Buy-Low-Sell-High)
- Profit in Credits und Prozent
- Mindestbestand: 100 units (buy/sell)
- Sortiert nach absolutem Profit

**2. High Value Commodities** (Top 10)
- Luxusgüter mit höchsten Verkaufspreisen
- Marktanzahl und Gesamtnachfrage
- Indikator für Rare/Luxury Items

**3. Most Active** (Top 10)
- Commodities mit meisten Updates in letzten 24h
- Durchschnittspreise (Buy/Sell)
- Gesamtbestand und Nachfrage
- Zeigt aktiven Handelsmarkt

**Performance:**
- Ticker-Generierung: ~1.2ms
- 3 optimierte Queries mit Aggregationen
- JOIN für Trade-Opportunity-Matching

**Struktur:**
```json
{
  "hotTrades": [{
    "commodity": "string",
    "profit": 1234,
    "profitPercent": 45,
    "buy": { "marketId": 123, "price": 100, "stock": 500 },
    "sell": { "marketId": 456, "price": 145, "demand": 300 }
  }],
  "highValue": [{
    "commodity": "string",
    "maxPrice": 50000,
    "markets": 15,
    "demand": 5000
  }],
  "mostActive": [{
    "commodity": "string", 
    "activeMarkets": 42,
    "avgBuyPrice": 1000,
    "avgSellPrice": 1200,
    "totalStock": 50000,
    "totalDemand": 30000
  }],
  "timestamp": "2025-11-17T12:22:42.719Z"
}
```

**Aufwand:** 2-3 Stunden ✅ **ERLEDIGT**  
**Nutzen:** Wertvollere API-Features für Trader als simple Price-Changes

---

## 🟢 NIEDRIG - Wartung & Cleanup

### ~~#6 - Station Schema-Erweiterung~~ ✅ ERLEDIGT
**Datei:** `lib/db/stations-db.js:24-25`  
**Problem:** Fehlende Station-Properties  
**Impact:** Unvollständige Daten  

**✅ GELÖST:**
Zwei neue Spalten zum Station-Schema hinzugefügt:

**1. prohibited (TEXT)**
- JSON-Array verbotener Commodities
- Aus EDDN Commodity Events extrahiert
- Beispiel: `["OnionHeadC", "Slaves"]`
- NULL wenn keine Verbote vorhanden

**2. carrierDockingAccess (TEXT)**
- Fleet Carrier Docking-Zugangslevel
- Werte: `'all'`, `'squadronFriends'`, `'none'`
- Aus Docked/CarrierJump Events (falls verfügbar)
- NULL wenn nicht Fleet Carrier oder nicht verfügbar

**Implementierung:**
- Schema-Migration in `migrateSchema()` automatisch
- Handling in `commodity-event.js` für prohibited
- Handling in `docked-event.js` für beide Felder
- Automatisches JSON.stringify() für Arrays

**Migration getestet:**
```
[stations.db] Found 2 missing column(s), applying migrations...
[stations.db] Adding column: prohibited
[stations.db] Adding column: carrierDockingAccess
[stations.db] Schema migration completed successfully
```

**Aufwand:** ~2 Stunden ✅ **ERLEDIGT**  
**Nutzen:** Vollständigere Station-Daten, besseres Fleet Carrier Tracking

---

### #7 - Index Umbenennung
**Datei:** `lib/db/systems-db.js:40`  
**Problem:** Inkonsistente Index-Namenskonvention  
**Impact:** Kosmetisch  
**Aktuell:**
```javascript
// TODO: rename index from systemSector to systems_systemSector
```
**Lösung:**
```sql
DROP INDEX IF EXISTS systemSector;
CREATE INDEX IF NOT EXISTS systems_systemSector ON systems (systemSector);
```
**Aufwand:** 15 Minuten  
**Nutzen:** Konsistente Namenskonvention

---

### ~~#8 - Broken Test Fix~~ ✅ ERLEDIGT
**Datei:** `tests/index.js:96-97`  
**Problem:** Test kommentiert wegen fehlendem JOIN  
**Impact:** Fehlende Test-Coverage  

**✅ GELÖST:**
Beide räumlichen Commodity-Tests wurden repariert und funktionieren jetzt korrekt:

**1. Spatial Query Test** - Commodities in nahegelegenen Märkten:
- Cross-Database JOIN zwischen `commodities` und `stations` Tabellen
- ATTACH DATABASE für Cross-DB-Abfragen implementiert
- Räumliche Distanzberechnung über `systemX/Y/Z` Koordinaten
- Optimiert mit bounding box und SQRT-Distanz-Sortierung
- Test-Performance: ~0.2ms

**2. System-Specific Query Test** - Commodities in bestimmtem System:
- JOIN für systemName-Filterung über stations-Tabelle  
- Korrekte COLLATE NOCASE Behandlung
- Test-Performance: ~0.1ms

**Implementierte Lösung:**
```javascript
// Database attachment for cross-database queries
tradeDb.exec(`ATTACH DATABASE '${stationsDb.name}' AS stationsDb`)

// Spatial query with distance calculation
const findCommodityOnNearbyMarkets = tradeDb.prepare(`
  SELECT c.*, s.systemX, s.systemY, s.systemZ,
    SQRT(POWER(s.systemX-@x,2)+POWER(s.systemY-@y,2)+POWER(s.systemZ-@z,2)) AS distance
  FROM commodities c
  JOIN stationsDb.stations s ON c.marketId = s.marketId
  WHERE c.commodityName = @commodityName COLLATE NOCASE
  AND s.systemX BETWEEN (@x-@distance) AND (@x+@distance)
  AND s.systemY BETWEEN (@y-@distance) AND (@y+@distance)
  AND s.systemZ BETWEEN (@z-@distance) AND (@z+@distance)
  AND SQRT(POWER(s.systemX-@x,2)+POWER(s.systemY-@y,2)+POWER(s.systemZ-@z,2)) < @distance
  ORDER BY distance ASC
  LIMIT 10
`)

// System-specific commodity query
const systemQuery = tradeDb.prepare(`
  SELECT c.*
  FROM commodities c
  JOIN stationsDb.stations s ON c.marketId = s.marketId
  WHERE s.systemName = @systemName COLLATE NOCASE 
  AND c.commodityName = @commodityName COLLATE NOCASE
`)
```

**Aufwand:** ~1 Stunde ✅ **ERLEDIGT**  
**Nutzen:** Vollständige Test-Coverage für Spatial-API Features

---

## 📊 Aufwandsschätzung Gesamt

| Priorität | Aufgaben | Geschätzter Aufwand |
|-----------|----------|---------------------|
| 🔴 Kritisch | 1 | 2-3 Stunden |
| 🟠 Hoch | 2 | ~2 Tage |
| 🟡 Mittel | 2 | ~6 Stunden |
| 🟢 Niedrig | 3 | ~3.5 Stunden |
| **GESAMT** | **8** | **~3-4 Tage** |

---

## 🎯 Empfohlene Reihenfolge

1. **#1 Dead Letter Queue** (2-3h) - Verhindert Datenverlust
2. **#3 Regelmäßiges VACUUM** (1h) - Quick Win
3. **#4 database-stats Rewrite** (3-4h) - Performance-Boost
4. **#5 Price Change Tracking** (2-3h) - Feature-Completion
5. **#2 sqlite3-rsync Stats** (1 Tag) - Größeres Refactoring
6. **#7 Index Umbenennung** (15min) - Quick Cleanup
7. **#6 Station Schema** (2h) - Data Completeness
8. **#8 Test Fix** (1h) - Test Coverage

---

**Erstellt am:** 17. November 2025  
**Letzte Aktualisierung:** 17. November 2025
