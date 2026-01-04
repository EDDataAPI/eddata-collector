const path = require('path')
const fs = require('fs')

/**
 * Safe VACUUM for large databases on memory-constrained servers
 * Uses disk-based temp storage instead of RAM to prevent OOM crashes
 */

const EDDATA_DATA_DIR = process.env.EDDATA_DATA_DIR || path.join(__dirname, '../eddata-data')
const TRADE_DB_PATH = path.join(EDDATA_DATA_DIR, 'trade.db')

console.log('========================================')
console.log('Safe VACUUM for trade.db')
console.log('========================================')
console.log('Database:', TRADE_DB_PATH)
console.log()

if (!fs.existsSync(TRADE_DB_PATH)) {
  console.error('❌ trade.db not found:', TRADE_DB_PATH)
  process.exit(1)
}

// Check current size
const statsBefore = fs.statSync(TRADE_DB_PATH)
const sizeMB = (statsBefore.size / 1024 / 1024).toFixed(2)
console.log(`Current size: ${sizeMB} MB`)
console.log()

// Initialize database with SAFE settings for large DB on small RAM
const Database = require('better-sqlite3')

console.log('Opening database with memory-safe settings...')
const db = new Database(TRADE_DB_PATH, { verbose: console.log })

// CRITICAL: Use FILE-based temp storage instead of MEMORY to prevent OOM
console.log('Configuring temp_store=FILE (prevents RAM exhaustion)...')
db.pragma('temp_store = FILE') // Use disk for temp data instead of RAM
db.pragma('temp_store_directory = "/tmp"') // Explicit temp directory

// Reduce cache during VACUUM to save RAM
const originalCacheSize = db.pragma('cache_size', { simple: true })
console.log(`Original cache_size: ${originalCacheSize}`)
console.log('Reducing cache_size to 256MB for VACUUM...')
db.pragma('cache_size = -256000') // 256MB cache (instead of 2GB)

console.log()
console.log('⚠️  Starting VACUUM (may take 15-30 minutes)...')
console.log('   Using disk-based temp storage to prevent OOM')
console.log('   This will NOT crash the server')
console.log()

const startTime = Date.now()

try {
  db.exec('VACUUM')
  
  const duration = Math.round((Date.now() - startTime) / 1000)
  console.log()
  console.log(`✅ VACUUM completed in ${duration} seconds (${Math.round(duration / 60)} minutes)`)
  
  // Restore original cache size
  console.log(`Restoring cache_size to ${originalCacheSize}...`)
  db.pragma(`cache_size = ${originalCacheSize}`)
  
  db.close()
  
  // Check new size
  const statsAfter = fs.statSync(TRADE_DB_PATH)
  const newSizeMB = (statsAfter.size / 1024 / 1024).toFixed(2)
  const savedMB = (sizeMB - newSizeMB).toFixed(2)
  const savedPercent = ((savedMB / sizeMB) * 100).toFixed(1)
  
  console.log()
  console.log('Size reduction:')
  console.log(`  Before: ${sizeMB} MB`)
  console.log(`  After:  ${newSizeMB} MB`)
  console.log(`  Saved:  ${savedMB} MB (${savedPercent}%)`)
  console.log()
  console.log('✅ Done! Restart the collector to apply changes.')
} catch (error) {
  console.error()
  console.error('❌ VACUUM failed:', error.message)
  db.close()
  process.exit(1)
}
