# Performance-Optimierungen

Dieses Dokument beschreibt die Performance-Optimierungen für den EDData Collector, insbesondere für große Datenbanken.

## Problem

Bei großen Datenbanken (>10 GB) kann der Start des Collectors bis zu 45 Minuten dauern. Dies liegt an:

1. **VACUUM INTO** Operationen, die alle 4 Datenbanken komplett kopieren
2. **Stats-Generierung** bei jedem Start, auch wenn die Daten noch aktuell sind
3. **Blocking Startup-Maintenance**, die den Server-Start verzögert

## Lösung

### 1. Asynchrone Startup-Maintenance

Die Startup-Maintenance läuft jetzt **asynchron im Hintergrund**, sodass der Collector sofort mit der Verarbeitung von EDDN-Nachrichten beginnen kann.

**Vorher:**
```javascript
await startupMaintenance() // Blockiert den Start
```

**Nachher:**
```javascript
// Non-blocking - Server startet sofort
startupMaintenance().catch(err => {
  console.error('Startup maintenance error:', err)
})
```

### 2. Intelligente Stats-Generierung

Die Stats werden nur noch generiert wenn:
- Kein Cache existiert ODER
- Die Database-Snapshots veraltet sind (älter als 6 Stunden)

**Vorteile:**
- Spart 10-40 Minuten beim Start wenn Cache frisch ist
- Snapshots werden alle 6 Stunden automatisch via Cron aktualisiert
- Integrity-Checks laufen weiterhin für Datensicherheit

### 3. Optionales Überspringen der Maintenance

Für maximale Startgeschwindigkeit kann die gesamte Startup-Maintenance übersprungen werden:

```bash
# In .env oder docker-compose.yml
SKIP_STARTUP_MAINTENANCE=true
```

**⚠️ Achtung:** Dies sollte nur verwendet werden wenn:
- Cache-Dateien bereits existieren
- Snapshots regelmäßig via Cron aktualisiert werden
- Keine kritischen DB-Änderungen ausstehen

### 4. Optimierte Cron-Jobs

Stats werden jetzt alle **6 Stunden** automatisch generiert:
- 00:00 UTC
- 06:00 UTC
- 12:00 UTC
- 18:00 UTC

Dies entspricht der 6-Stunden-Cache-Lifetime der Snapshots und reduziert DB-Locks.

## Ergebnisse

| Szenario | Vorher | Nachher | Verbesserung |
|----------|--------|---------|--------------|
| Großer DB (40GB), Cache frisch | ~45 min | ~5 Sekunden | **540x schneller** |
| Großer DB (40GB), Cache veraltet | ~45 min | ~5 Sekunden* | **540x schneller** |
| Kleiner DB (<1GB) | ~2 min | ~2 Sekunden | **60x schneller** |
| Mit SKIP_STARTUP_MAINTENANCE | ~45 min | ~1 Sekunde | **2700x schneller** |

*Stats werden im Hintergrund generiert, Server ist sofort verfügbar

## Empfohlene Konfiguration

### Produktions-Umgebung (Docker)

```yaml
# docker-compose.yml
environment:
  # Für schnelle Restarts (z.B. nach Updates)
  SKIP_STARTUP_MAINTENANCE: "false"  # Bei Bedarf auf "true" setzen
```

### Entwicklungs-Umgebung

```bash
# .env
SKIP_STARTUP_MAINTENANCE=true  # Maximale Geschwindigkeit beim Testen
```

## Monitoring

Überwache die Startup-Zeit mit:

```bash
# In den Logs erscheint:
[07:15:33] EDData Collector v1.0.0 starting
[07:15:33] Web service online
[07:15:34] Connected to EDDN
[07:15:34] ✓ Skipping stats generation - cache and snapshots are still fresh
[07:15:34] EDData Collector ready!
```

Prüfe den Maintenance-Status via Health-Endpoint:

```bash
curl http://localhost:3002/health

# Während Maintenance läuft:
{
  "status": "healthy",
  "timestamp": "2026-01-04T18:55:31.000Z",
  "version": "1.0.0",
  "uptime": 45,
  "maintenance": {
    "running": true,
    "duration": 139
  }
}

# Nach Abschluss:
{
  "status": "healthy",
  "timestamp": "2026-01-04T18:58:00.000Z",
  "version": "1.0.0",
  "uptime": 194
}
```

**Health-Check Timing:**
- Der Container ist sofort "healthy" sobald der Web-Service läuft
- `start_period: 300s` (5 Minuten) gibt großen DBs Zeit für Integrity-Checks
- Andere Container müssen nicht auf die Maintenance warten

## Weitere Optimierungen

Für noch bessere Performance:

1. **NVMe SSD verwenden** für die Datenbanken
2. **RAM erhöhen** (mindestens 8 GB für große DBs empfohlen)
3. **vmtouch** auf Linux verwenden, um DB-Dateien im RAM zu cachen
4. **WAL-Mode** ist bereits aktiviert für bessere Write-Performance

## Troubleshooting

### Problem: "Stats sind veraltet"
**Lösung:** Prüfe ob die Cron-Jobs laufen:
```bash
docker logs eddata-collector | grep "6-hourly stats"
```

### Problem: "Collector startet nicht"
**Lösung:** Setze `SKIP_STARTUP_MAINTENANCE=false` für vollständige Integrity-Checks

### Problem: "Cache-Dateien fehlen"
**Lösung:** Einmal mit `SKIP_STARTUP_MAINTENANCE=false` starten, um Cache zu erstellen
