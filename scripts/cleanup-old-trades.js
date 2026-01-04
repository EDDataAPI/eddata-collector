// One-time script to delete old trade data (30+ days)
// Run this to clean up the 7.4GB trade.db immediately

const { tradeDb } = require('../lib/db')
const { getISOTimestamp } = require('../lib/utils/dates')

const DAYS_TO_KEEP = 30

console.log('========================================')
console.log('Trade Data Cleanup Script')
console.log('========================================')
console.log(`Deleting trades older than ${DAYS_TO_KEEP} days...`)
console.log('')

// Check current database size
console.log('Analyzing current data...')
const stats = tradeDb.prepare(`
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN updatedAt <= datetime('now', '-${DAYS_TO_KEEP} days') THEN 1 END) as old,
    COUNT(CASE WHEN updatedAt > datetime('now', '-${DAYS_TO_KEEP} days') THEN 1 END) as current
  FROM commodities
`).get()

console.log(`Total trades: ${stats.total.toLocaleString()}`)
console.log(`Old trades (>${DAYS_TO_KEEP}d): ${stats.old.toLocaleString()} (${Math.round(stats.old/stats.total*100)}%)`)
console.log(`Current trades (<${DAYS_TO_KEEP}d): ${stats.current.toLocaleString()} (${Math.round(stats.current/stats.total*100)}%)`)
console.log('')

if (stats.old === 0) {
  console.log('✅ No old data to delete!')
  tradeDb.close()
  process.exit(0)
}

// Delete old trades
console.log(`Deleting ${stats.old.toLocaleString()} old trades...`)
console.time('Delete operation')

const result = tradeDb.prepare(`
  DELETE FROM commodities WHERE updatedAt <= datetime('now', '-${DAYS_TO_KEEP} days')
`).run()

console.timeEnd('Delete operation')
console.log(`✅ Deleted ${result.changes.toLocaleString()} rows`)
console.log('')

// Optimize database to reclaim space
console.log('Optimizing database to reclaim disk space...')
console.log('⚠️  This will take 10-20 minutes for a 7GB database')
console.time('VACUUM operation')

tradeDb.exec('VACUUM')

console.timeEnd('VACUUM operation')
console.log('')

// Check new size
const newStats = tradeDb.prepare('SELECT COUNT(*) as total FROM commodities').get()
console.log('========================================')
console.log('Cleanup Complete!')
console.log('========================================')
console.log(`Remaining trades: ${newStats.total.toLocaleString()}`)
console.log('')
console.log('⚠️  Database file size will be reduced after VACUUM')
console.log('   Check file size: ls -lh eddata-data/trade.db*')
console.log('')
console.log('✅ Done! Restart the collector to apply changes.')

tradeDb.close()
process.exit(0)
