# Cloudflare R2 Setup für Backup-Downloads

Dieses Dokument beschreibt, wie du Cloudflare R2 für öffentliche Backup-Downloads einrichtest.

## 🎯 Warum R2?

- ✅ **10 GB kostenlos** (reicht für komprimierte Backups)
- ✅ **Kein Egress** (Bandwidth kostenlos!)
- ✅ **S3-kompatibel** (einfache Integration)
- ✅ **Globales CDN** (schneller Download weltweit)
- ✅ **Automatische Caching**

## 📊 Speicherplatz-Berechnung

```
locations.db:  ~500 MB → ~150 MB komprimiert
stations.db:   ~800 MB → ~250 MB komprimiert
systems.db:    ~1 GB   → ~300 MB komprimiert
trade.db:      ~7 GB   → ~2.5 GB komprimiert
---------------------------------------------------
Gesamt:        ~9.5 GB → ~3.2 GB komprimiert ✅
```

**Ergebnis:** Passt perfekt ins kostenlose 10 GB Tier!

## 🚀 Setup-Schritte

### 1. Cloudflare R2 Bucket erstellen

1. Gehe zu [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigiere zu **R2 Object Storage**
3. Klicke auf **Create bucket**
4. Name: `eddata-backups` (oder eigener Name)
5. Location: **Automatic** (optimal für globale Verfügbarkeit)

### 2. API-Token erstellen

1. Im R2-Dashboard → **Manage R2 API Tokens**
2. Klicke auf **Create API Token**
3. **Permissions:** Object Read & Write
4. **Buckets:** Wähle `eddata-backups`
5. Speichere die Credentials:
   - Account ID
   - Access Key ID
   - Secret Access Key

### 3. Public Access aktivieren (optional)

Für öffentliche Downloads:

1. Bucket öffnen → **Settings**
2. **Public Access** → Enable
3. **Custom Domain** (optional):
   - Füge CNAME hinzu: `downloads.deine-domain.com` → `pub-XXX.r2.dev`
   - Oder nutze Standard: `https://pub-ACCOUNT_ID.r2.dev`

### 4. Umgebungsvariablen setzen

Erstelle `.env` oder füge zu deiner Konfiguration hinzu:

```bash
# Cloudflare R2 Credentials
CLOUDFLARE_R2_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key_here
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_key_here
CLOUDFLARE_R2_BUCKET_NAME=eddata-backups

# Optional: Custom Public URL (default: pub-ACCOUNT_ID.r2.dev)
CLOUDFLARE_R2_PUBLIC_URL=https://downloads.your-domain.com

# Update EDDATA_DOWNLOADS_BASE_URL to use R2
EDDATA_DOWNLOADS_BASE_URL=${CLOUDFLARE_R2_PUBLIC_URL}
```

### 5. Dependencies installieren

```bash
npm install @aws-sdk/client-s3
```

### 6. Backup-Workflow mit R2

```bash
# 1. Backup erstellen
npm run backup

# 2. Backups komprimieren
npm run backup:compress

# 3. Zu R2 hochladen
npm run upload:r2
```

## 🔄 Automatisierung

### Cron-Job Beispiel

```bash
#!/bin/bash
# /etc/cron.weekly/eddata-backup-upload

# Wechsel ins Projektverzeichnis
cd /app

# Backup-Workflow
npm run backup
npm run backup:compress
npm run upload:r2

# Lokale komprimierte Backups älter als 7 Tage löschen
find eddata-downloads/*.gz -mtime +7 -delete

echo "Backup uploaded to R2: $(date)"
```

### Docker Integration

Füge zu `docker-compose.yml` hinzu:

```yaml
environment:
  # ... existing vars ...
  - CLOUDFLARE_R2_ACCOUNT_ID=${CLOUDFLARE_R2_ACCOUNT_ID}
  - CLOUDFLARE_R2_ACCESS_KEY_ID=${CLOUDFLARE_R2_ACCESS_KEY_ID}
  - CLOUDFLARE_R2_SECRET_ACCESS_KEY=${CLOUDFLARE_R2_SECRET_ACCESS_KEY}
  - CLOUDFLARE_R2_BUCKET_NAME=${CLOUDFLARE_R2_BUCKET_NAME:-eddata-backups}
  - CLOUDFLARE_R2_PUBLIC_URL=${CLOUDFLARE_R2_PUBLIC_URL}
```

## 📥 Download-Beispiele

### Manifest abrufen

```bash
curl https://pub-ACCOUNT_ID.r2.dev/downloads.json
```

Antwort:
```json
{
  "locations.db": {
    "name": "locations.db",
    "url": "https://pub-XXX.r2.dev/locations.db.gz",
    "size": 157286400,
    "created": "2026-01-05T12:00:00.000Z",
    "sha256": "abc123..."
  },
  "systems.db": { ... },
  "stations.db": { ... },
  "trade.db": { ... }
}
```

### Backup herunterladen

```bash
# Download und entpacken
curl https://pub-ACCOUNT_ID.r2.dev/systems.db.gz | gunzip > systems.db

# Mit Checksum-Verifikation
wget https://pub-ACCOUNT_ID.r2.dev/systems.db.gz
sha256sum -c <<< "HASH_FROM_MANIFEST systems.db.gz"
gunzip systems.db.gz
```

## 💰 Kosten-Monitoring

R2 Free Tier (immer kostenlos):
- ✅ 10 GB Speicher
- ✅ 1M Class A Operationen (Writes)
- ✅ 10M Class B Operationen (Reads)
- ✅ Unbegrenzter Egress (!)

Überwachung im Dashboard:
- R2 → **Analytics**
- Zeigt Speichernutzung und API-Calls

## 🔐 Sicherheit

### Private Backups

Falls Backups nicht öffentlich sein sollen:

1. **Public Access deaktivieren**
2. **Presigned URLs** für temporären Zugriff:

```javascript
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

// Generate temporary download URL (expires in 1 hour)
const command = new GetObjectCommand({
  Bucket: 'eddata-backups',
  Key: 'systems.db.gz'
})
const url = await getSignedUrl(r2Client, command, { expiresIn: 3600 })
```

## 🧪 Testing

```bash
# Test Upload (Dry-Run)
node scripts/upload-to-r2.js

# Verify in Browser
open https://pub-ACCOUNT_ID.r2.dev/downloads.json

# Test Download
curl -I https://pub-ACCOUNT_ID.r2.dev/systems.db.gz
```

## 🐛 Troubleshooting

### "Access Denied"
- Prüfe API Token Permissions (Read & Write)
- Prüfe Bucket Name

### "Bucket not found"
- Account ID korrekt?
- Bucket Name exakt wie erstellt?

### Upload langsam
- R2 nutzt Multi-Part Upload für große Dateien
- Netzwerk-Latenz zum nächsten Cloudflare POP prüfen

## 📚 Weitere Resourcen

- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [AWS SDK v3 für JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
