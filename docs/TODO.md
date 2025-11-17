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

### #4 - database-stats.js Rewrite
**Datei:** `scripts/stats/database-stats.js:6`  
**Problem:** Langsame COUNT(*) Queries, ungenaue Stats  
**Impact:** Langsame Stats-Generierung  
**Aktuell:**
```javascript
// TODO: This needs a complete rewrite, it's both slow and not very precise
```
**Lösung:** 
- Kombinierte Queries wie bei commodity-stats
- Verwende CASE-Statements statt Sub-Queries
- Cache häufig abgefragte Werte

**Aufwand:** ~3-4 Stunden  
**Nutzen:** Schnellere Stats-Generierung (~50% Reduktion)

---

### #5 - Price Change Tracking (Commodity Ticker)
**Datei:** `scripts/stats/commodity-stats.js:21`  
**Problem:** commodity-ticker.json ist leer  
**Impact:** API liefert keine Price-Change-Daten  
**Aktuell:**
```javascript
ticker: [], // TODO: Add price change tracking
```
**Lösung:**
```javascript
// Track Top 10 größte Preisänderungen in letzten 24h
const priceChanges = tradeDb.prepare(`
  SELECT commodityName, 
    (maxSellPrice - minBuyPrice) as spread,
    ((maxSellPrice - minBuyPrice) / minBuyPrice * 100) as percentChange
  FROM commodities
  WHERE updatedAt > @last24h
  ORDER BY percentChange DESC
  LIMIT 10
`).all({ last24h: getISOTimestamp(-1) })
```
**Aufwand:** ~2-3 Stunden  
**Nutzen:** Bessere API-Features für Trader

---

## 🟢 NIEDRIG - Wartung & Cleanup

### #6 - Station Schema-Erweiterung
**Datei:** `lib/db/stations-db.js:24-25`  
**Problem:** Fehlende Station-Properties  
**Impact:** Unvollständige Daten  
**Aktuell:**
```javascript
// TODO: Add 'prohibited' (text, array of prohibited goods)
// TODO: Add 'carrierDockingAccess'
```
**Lösung:**
```javascript
prohibited TEXT,           // JSON array of prohibited commodities
carrierDockingAccess TEXT  // 'all', 'squadronFriends', 'none'
```
**Aufwand:** ~2 Stunden  
**Nutzen:** Vollständigere Station-Daten

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

### #8 - Broken Test Fix
**Datei:** `tests/index.js:96-97`  
**Problem:** Test kommentiert wegen fehlendem JOIN  
**Impact:** Fehlende Test-Coverage  
**Aktuell:**
```javascript
// TODO: Fix this test - commodities table doesn't have systemX/Y/Z columns
// Need to JOIN with stations/systems tables or restructure schema
```
**Lösung:**
```javascript
const findCommodityOnNearbyMarkets = tradeDb.prepare(`
  SELECT c.*, s.systemX, s.systemY, s.systemZ,
    SQRT(POWER(s.systemX-@x,2)+POWER(s.systemY-@y,2)+POWER(s.systemZ-@z,2)) AS distance
  FROM commodities c
  JOIN stationsDb.stations s ON c.marketId = s.marketId
  WHERE c.commodityName = @commodityName
  AND s.systemX BETWEEN (@x-@distance) AND (@x+@distance)
  AND s.systemY BETWEEN (@y-@distance) AND (@y+@distance)
  AND s.systemZ BETWEEN (@z-@distance) AND (@z+@distance)
  ORDER BY distance ASC
  LIMIT 10
`)
```
**Aufwand:** ~1 Stunde  
**Nutzen:** Vollständige Test-Coverage

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
