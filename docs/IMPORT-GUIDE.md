# 📥 SQLite Database Import Guide

## Overview

The EDData Collector includes a powerful SQLite import tool that allows you to import data from external SQLite databases into your EDData instance. This is useful for:

- 🔄 Migrating data from other Elite Dangerous data sources
- 📦 Importing pre-populated databases (EDSM, EDDB, Spansh, etc.)
- 🔙 Restoring from custom backups
- 🔀 Merging data from multiple sources

## Quick Start

### Basic Import

```bash
# Preview what would be imported (dry-run)
npm run import -- --source=/path/to/source.db --target=systems --dry-run

# Import with automatic merge (skips duplicates)
npm run import -- --source=/path/to/systems.db --target=systems --force

# Import with validation
npm run import -- --source=/path/to/stations.db --target=stations --validate --force
```

### Docker Environment

```bash
# Copy your database to the container
docker cp /path/to/systems.db eddata-collector:/app/import/systems.db

# Run import inside container
docker exec eddata-collector npm run import -- --source=/app/import/systems.db --target=systems --force

# Or mount import directory in docker-compose.yml:
volumes:
  - ./import:/app/import:ro
```

## Import Modes

### 🔀 Merge Mode (Default - Safest)

Merges new data with existing data, **skipping duplicates** based on primary keys.

```bash
npm run import -- --source=source.db --target=systems --mode=merge --force
```

**Use when:**
- ✅ Adding new systems/stations without overwriting existing data
- ✅ Combining multiple data sources
- ✅ You want to preserve existing records

**Behavior:**
- Inserts new records
- Skips records with existing primary keys
- No data loss

---

### ♻️ Replace Mode (Destructive)

**DELETES ALL** existing data and replaces it with source data.

```bash
npm run import -- --source=source.db --target=systems --mode=replace --force
```

**⚠️ WARNING: This will DELETE all existing data in the target database!**

**Use when:**
- ⚠️ Starting fresh with a complete dataset
- ⚠️ You're absolutely sure you want to replace everything
- ⚠️ You have a backup

**Behavior:**
- Deletes all existing records
- Imports all source records
- Irreversible without backup

---

### 🔄 Update Mode

Updates existing records only, **ignores new records**.

```bash
npm run import -- --source=source.db --target=stations --mode=update --force
```

**Use when:**
- ✅ Refreshing data for existing systems/stations
- ✅ Updating coordinates or other attributes
- ✅ You don't want to add new records

**Behavior:**
- Updates records with matching primary keys
- Ignores new records
- Existing data preserved if not in source

---

### ➕ Append Mode

Appends all records, **allowing duplicates**.

```bash
npm run import -- --source=source.db --target=trade --mode=append --force
```

**Use when:**
- ⚠️ You specifically want duplicate records
- ⚠️ Tables have no primary keys
- ⚠️ Temporary imports for analysis

**Behavior:**
- Inserts all records
- Allows duplicates
- May increase database size significantly

## Target Databases

### Systems Database (`--target=systems`)

Contains star system data including coordinates and system information.

```bash
npm run import -- --source=edsm-systems.db --target=systems --mode=merge --force
```

**Expected tables:** `systems`

**Primary key:** `systemAddress` or `systemName`

---

### Stations Database (`--target=stations`)

Contains space stations, outposts, fleet carriers, and settlements.

```bash
npm run import -- --source=eddb-stations.db --target=stations --mode=merge --force
```

**Expected tables:** `stations`

**Primary key:** `marketId`

---

### Locations Database (`--target=locations`)

Contains planetary bodies, rings, and points of interest.

```bash
npm run import -- --source=bodies.db --target=locations --mode=merge --force
```

**Expected tables:** `locations`, `rings`, `bodies`

**Primary key:** Varies by table

---

### Trade Database (`--target=trade`)

Contains commodity market data and trade information.

```bash
npm run import -- --source=trade-data.db --target=trade --mode=merge --force
```

**Expected tables:** `commodities`, `markets`

**Primary key:** Composite keys

⚠️ **Note:** Trade database imports can be very large and memory-intensive!

## Advanced Options

### Import Specific Table

Only import a specific table instead of all tables:

```bash
npm run import -- --source=data.db --target=stations --table=stations --force
```

### Batch Size

Control transaction size for memory management:

```bash
# Smaller batches for limited RAM
npm run import -- --source=huge.db --target=systems --batch-size=5000 --force

# Larger batches for faster imports (more RAM required)
npm run import -- --source=data.db --target=systems --batch-size=50000 --force
```

**Default:** 10,000 rows per transaction

**Recommendations:**
- 8GB RAM: `--batch-size=5000`
- 16GB RAM: `--batch-size=10000` (default)
- 32GB+ RAM: `--batch-size=50000`

### Error Handling

Continue import even if individual rows fail:

```bash
npm run import -- --source=messy-data.db --target=systems --skip-errors --force
```

**Without `--skip-errors`:** Import stops on first error  
**With `--skip-errors`:** Errors are logged, import continues

### Validation

Verify database integrity after import:

```bash
npm run import -- --source=data.db --target=systems --validate --force
```

Performs:
- ✅ SQLite integrity check
- ✅ Row count verification
- ✅ Schema validation

## Common Use Cases

### 1. Import EDSM Systems Data

```bash
# Download EDSM systems dump
wget https://www.edsm.net/dump/systemsPopulated.json.gz
gunzip systemsPopulated.json.gz

# Convert to SQLite (using your own converter)
# ... conversion process ...

# Import
npm run import -- --source=edsm-systems.db --target=systems --mode=merge --validate --force
```

### 2. Import Spansh Stations

```bash
# Download Spansh stations data
wget https://downloads.spansh.co.uk/stations.json

# Convert to SQLite format
# ... conversion process ...

# Import
npm run import -- --source=spansh-stations.db --target=stations --mode=merge --force
```

### 3. Restore from Backup

```bash
# Use built-in restore script for full backups
npm run restore

# Or use import for selective restore
npm run import -- --source=/backup/systems-old.db --target=systems --mode=replace --force
```

### 4. Merge Multiple Sources

```bash
# Import from EDSM
npm run import -- --source=edsm-systems.db --target=systems --mode=merge --force

# Add data from another source (duplicates skipped)
npm run import -- --source=other-systems.db --target=systems --mode=merge --force

# Add stations
npm run import -- --source=stations-combined.db --target=stations --mode=merge --force
```

### 5. Docker Volume Mount

Update `docker-compose.yml`:

```yaml
services:
  eddata-collector:
    volumes:
      - eddata-data:/app/eddata-data
      - ./import:/app/import:ro  # Add this line
```

Then:

```bash
# Copy your database to ./import directory
cp /path/to/systems.db ./import/

# Run import inside container
docker exec eddata-collector npm run import -- \
  --source=/app/import/systems.db \
  --target=systems \
  --mode=merge \
  --force
```

## Performance Tips

### 🚀 Fast Import (New Database)

For importing into a **completely new/empty** database:

```bash
# Stop collector to avoid conflicts
docker stop eddata-collector

# Remove existing database
rm ./eddata-data/systems.db*

# Import with optimized settings
npm run import -- \
  --source=large-systems.db \
  --target=systems \
  --mode=replace \
  --batch-size=50000 \
  --force

# Optimize after import
npm run optimize

# Restart collector
docker start eddata-collector
```

### 💾 Large Database Imports

For databases >1GB:

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=8192" npm run import -- \
  --source=huge-database.db \
  --target=trade \
  --batch-size=5000 \
  --skip-errors \
  --force
```

### 📊 Progress Monitoring

The import tool shows real-time progress:

```
📊 Importing table: systems
   Columns: systemAddress, systemName, systemX, systemY, systemZ, ...
   Primary key: systemAddress
   Total rows to import: 5,234,567
   Processing in batches of 10,000...
   Progress: 1,240,000/5,234,567 (23.7%)
```

## Troubleshooting

### "Source database not found"

Ensure the path is absolute or relative to the project root:

```bash
# Wrong
--source=systems.db

# Right
--source=/app/import/systems.db
--source=./import/systems.db
```

### "Table doesn't exist in target"

The import tool automatically creates tables, but ensure schema compatibility:

```bash
# Use dry-run to preview
npm run import -- --source=data.db --target=systems --dry-run
```

### Out of Memory Errors

Reduce batch size and increase Node.js memory:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run import -- \
  --source=data.db \
  --target=systems \
  --batch-size=2000 \
  --force
```

### Database Locked

Ensure no other processes are accessing the database:

```bash
# Stop collector
docker stop eddata-collector

# Run import
npm run import -- --source=data.db --target=systems --force

# Start collector
docker start eddata-collector
```

### Import Verification Failed

Run integrity checks manually:

```bash
sqlite3 ./eddata-data/systems.db "PRAGMA integrity_check;"
sqlite3 ./eddata-data/systems.db "SELECT COUNT(*) FROM systems;"
```

## Safety Checklist

Before running a destructive import:

- [ ] ✅ Create a backup: `npm run backup`
- [ ] ✅ Run dry-run first: `--dry-run`
- [ ] ✅ Stop collector if needed
- [ ] ✅ Verify source database integrity
- [ ] ✅ Check available disk space
- [ ] ✅ Monitor memory usage
- [ ] ✅ Use `--validate` flag
- [ ] ✅ Test with small subset first

## Examples

### Complete Import Workflow

```bash
# 1. Backup existing data
npm run backup

# 2. Preview import
npm run import -- \
  --source=/import/systems.db \
  --target=systems \
  --dry-run

# 3. Run actual import
npm run import -- \
  --source=/import/systems.db \
  --target=systems \
  --mode=merge \
  --validate \
  --force

# 4. Verify results
npm run stats:database

# 5. Optimize database
npm run optimize
```

## Support

For issues or questions:

- 📝 [GitHub Issues](https://github.com/EDDataAPI/eddata-collector/issues)
- 📖 [Full Documentation](https://github.com/EDDataAPI/eddata-collector)
- 💬 [Community Discord](https://discord.gg/elite-dangerous)

## Related Scripts

- `npm run download` - Download official database backups
- `npm run restore` - Restore from backup directory
- `npm run backup` - Create database backups
- `npm run optimize` - Optimize database performance
- `npm run stats:database` - View database statistics
