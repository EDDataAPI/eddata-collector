# Setup Guide - Cache & API Integration

## Problem
Die API kann die Cache-Dateien vom Collector nicht finden.

## Lösung: Symlink erstellen

Um die Cache-Dateien vom Collector für die API zugänglich zu machen, muss ein Symlink erstellt werden:

### Windows (PowerShell Admin)
```powershell
cd "X:\Github Workspace\Elite Dangerous\EDData\eddata-api"
New-Item -ItemType SymbolicLink -Path "eddata-data" -Target "X:\Github Workspace\Elite Dangerous\EDData\eddata-collector\eddata-data" -Force
```

### Linux/Mac
```bash
cd eddata-api
ln -s ../eddata-collector/eddata-data eddata-data
```

## Verifikation
```bash
# Cache-Dateien sollten jetzt erreichbar sein
ls eddata-api/eddata-data/cache/
# Output sollte zeigen:
# - galnet-news.json
# - commodity-ticker.json
# - database-stats.json
# - commodities.json
```

## Wie es funktioniert

1. **Collector** generiert Daten:
   - `eddata-collector/eddata-data/` enthält SQLite DBs und Cache-Dateien
   - Cache wird von Cron-Jobs generiert (alle 6h)

2. **API** liest Daten:
   - Via Symlink: `eddata-api/eddata-data/` → `eddata-collector/eddata-data/`
   - Endpoints verfügbar:
     - `/v2/news/galnet` - Galnet News (50 Artikel)
     - `/v2/news/commodities` - Hot Trades Top 20
     - `/v2/stats` - Datenbankstatistiken

3. **Caching in .gitignore**:
   - `eddata-api/.gitignore` enthält `eddata-data`
   - Symlink wird nicht committed (absichtlich)

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
