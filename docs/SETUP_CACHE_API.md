# Setup Guide - Cache & API Integration

## Architektur

Die Collector und API Services laufen in separaten Containern, greifen aber auf die gleichen Daten via Volume Mounts zu.

## Datenfluss

1. **Collector** generiert Daten:
   - Läuft in eigenem Container
   - Speichert in `/app/data/` (intern):
     - SQLite Datenbanken: `*.db`, `*.db-shm`, `*.db-wal`
     - Cache-Dateien: `cache/*.json`
   - Generiert alle 6h neue Stats

2. **API** liest Daten:
   - Läuft in eigenem Container
   - Mountet `/app/data/` readonly vom gleichen Volume
   - Liest Cache-Dateien:
     - `/v2/news/galnet` - Galnet News (50 Artikel)
     - `/v2/news/commodities` - Hot Trades Top 20
     - `/v2/stats` - Datenbankstatistiken

3. **Volume Sharing** (Docker Compose):
   ```yaml
   volumes:
     collector-data:
   
   services:
     collector:
       volumes:
         - collector-data:/app/data
     api:
       volumes:
         - collector-data:/app/data:ro  # readonly
   ```

## Umgebungsvariablen

Optional: Statt Symlink kannst du auch Environment Variable setzen:

```bash
export EDDATA_DATA_DIR=/path/to/eddata-collector/eddata-data
npm start
```

## API Tests

```bash
# Galnet News testen
curl http://localhost:3001/v2/news/galnet | jq '.[] | {title, date}' | head -5

# Hot Trades testen  
curl http://localhost:3001/v2/news/commodities | jq '.hotTrades[] | {commodity, profit}'

# Stats testen
curl http://localhost:3001/v2/stats
```

## Troubleshooting

### "Cache file not found"
- Prüfe ob Symlink existiert: `ls -la eddata-api/eddata-data`
- Prüfe ob Cache-Dateien im Collector existieren: `ls -la eddata-collector/eddata-data/cache/`
- Erstelle Symlink neu

### "Empty cache response"
- Collector läuft nicht?
- Cache-Dateien sind leer?
- Starte Collector: `npm start` im collector Verzeichnis
- Force Stats-Generierung: `npm run stats:commodity`

### Windows Symlink Fehler
- PowerShell als **Administrator** starten
- Oder Git Bash verwenden: `ln -s` arbeitet auch dort

## Details

Siehe auch:
- `eddata-collector/lib/consts.js` - Pfad-Konfiguration
- `eddata-api/lib/consts.js` - Cache-Pfad-Konfiguration
- `eddata-api/router/api/news.js` - News Handler
