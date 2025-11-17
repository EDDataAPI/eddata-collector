# Database Snapshot System

## Overview

The EDData Collector now uses a database snapshot system for stats generation. This eliminates production database impact and enables more frequent statistics updates.

## How It Works

### 1. Snapshot Creation

Snapshots are created using SQLite's `VACUUM INTO` command, which:
- Creates a consistent, point-in-time copy of the database
- Compacts the database (removes fragmentation)
- Doesn't require locks on the source database
- Completes in ~850ms for all 4 databases

```javascript
db.exec(`VACUUM INTO '${snapshotPath}'`)
```

### 2. Automatic Refresh

- Snapshots are stored in `data/.snapshots/`
- Auto-refresh every 2 hours if stale
- Stats scripts check freshness before running
- Manual refresh: `npm run snapshot`

### 3. Stats Generation

Stats scripts now:
1. Check if snapshots are fresh (`areSnapshotsFresh()`)
2. Create new snapshots if needed (`createSnapshots()`)
3. Connect to read-only snapshot databases
4. Run all queries against snapshots
5. Close snapshot connections

## Benefits

✅ **Zero Production Impact**
- Stats queries don't block live database writes
- No WAL checkpoints during stats generation
- Production message processing unaffected

✅ **Frequent Updates**
- Previously: Once daily at 6 AM
- Now: Every hour on the hour
- Can run even more frequently if needed

✅ **Fast Execution**
- Snapshot creation: ~850ms
- Read-only queries are faster
- No interference from concurrent writes

✅ **Consistent Results**
- Point-in-time snapshot ensures consistency
- No anomalies from concurrent modifications
- Repeatable stats generation

## Usage

### Manual Snapshot Creation
```bash
npm run snapshot
```

### Stats Generation (Auto-snapshots)
```bash
npm run stats              # All stats
npm run stats:database     # Database stats only
npm run stats:commodity    # Commodity stats only
```

### Programmatic Usage
```javascript
const { 
  createSnapshots, 
  areSnapshotsFresh, 
  getSnapshotPaths 
} = require('./scripts/stats/snapshot-databases')

// Check freshness
if (!areSnapshotsFresh()) {
  createSnapshots()
}

// Get snapshot paths
const paths = getSnapshotPaths()
// {
//   systemsDb: '.../systems.db',
//   locationsDb: '.../locations.db',
//   stationsDb: '.../stations.db',
//   tradeDb: '.../trade.db'
// }

// Connect to snapshots
const SqliteDatabase = require('better-sqlite3')
const tradeDb = new SqliteDatabase(paths.tradeDb, { readonly: true })
```

## Configuration

### Snapshot Age Limit
Default: 2 hours (7,200,000 ms)

```javascript
// scripts/stats/snapshot-databases.js
const SNAPSHOT_AGE_LIMIT = 2 * 60 * 60 * 1000
```

### Snapshot Location
Default: `data/.snapshots/`

```javascript
const SNAPSHOT_DIR = path.join(__dirname, '../../data/.snapshots')
```

## Cron Schedule

```javascript
// index.js - Hourly stats generation
cron.schedule('0 * * * *', () => {
  exec('npm run stats')
})
```

To change frequency:
- `'*/30 * * * *'` - Every 30 minutes
- `'0 */6 * * *'` - Every 6 hours
- `'0 0 * * *'` - Daily at midnight

## Disk Space

### Snapshot Sizes
- `systems.db`: ~0.02 MB (test data)
- `locations.db`: ~0.02 MB (test data)
- `stations.db`: ~0.02 MB (test data)
- `trade.db`: ~0.03 MB (test data)

**Production estimates:**
- Full systems: ~500 MB
- Full stations: ~200 MB
- Full trade: ~2 GB
- Total snapshots: ~3 GB

### Cleanup
Snapshots are automatically replaced when refreshed. Old snapshots are deleted before creating new ones.

## Architecture

```
┌─────────────────┐
│  Production DBs │
│  (Live Writes)  │
└────────┬────────┘
         │
         │ VACUUM INTO
         │ (every 2h)
         ▼
┌─────────────────┐
│  Snapshot DBs   │
│  (Read-Only)    │
└────────┬────────┘
         │
         │ Stats Queries
         │ (every 1h)
         ▼
┌─────────────────┐
│  Stats JSON     │
│  (API Output)   │
└─────────────────┘
```

## Migration from Legacy

### Before (TODO #2)
- Daily stats at 6 AM
- Blocked production database
- Long-running queries interfered with writes

### After (Implemented)
- Hourly stats updates
- Zero production impact
- Fast, consistent results

### Code Changes

**database-stats.js:**
```javascript
// OLD: Direct production DB access
const { systemsDb, tradeDb } = require('../../lib/db')

// NEW: Snapshot connections
const paths = getSnapshotPaths()
const systemsDb = new SqliteDatabase(paths.systemsDb, { readonly: true })
```

**commodity-stats.js:**
```javascript
// NEW: Initialize with snapshot connections
initializeDatabases({ tradeDb, systemsDb, stationsDb })
```

## Troubleshooting

### Snapshots Not Refreshing
Check directory permissions:
```bash
ls -la data/.snapshots/
```

### Stale Snapshots
Force refresh:
```bash
rm -rf data/.snapshots/
npm run snapshot
```

### Disk Space Issues
Increase refresh interval or reduce snapshot frequency.

## Performance Metrics

**Snapshot Creation:**
- systems.db: 157ms
- locations.db: 113ms
- stations.db: 195ms
- trade.db: 188ms
- **Total: 850ms**

**Stats Generation:**
- database-stats: 13ms (was blocked for seconds)
- commodity-stats: <5ms (empty test data)

## Future Enhancements

- [ ] Incremental snapshots (track changes only)
- [ ] Compression of older snapshots
- [ ] Snapshot retention policy (keep last N)
- [ ] Snapshot verification checksums
- [ ] Parallel snapshot creation
- [ ] Backup integration (use snapshots for backups)

## Related Files

- `scripts/stats/snapshot-databases.js` - Main implementation
- `scripts/stats/database-stats.js` - Uses snapshots
- `scripts/stats/commodity-stats.js` - Uses snapshots
- `lib/stats/commodity-stats.js` - Snapshot support
- `index.js` - Hourly cron job
- `.gitignore` - Excludes snapshots from git

## License

Same as EDData Collector - MIT License
