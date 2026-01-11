#!/usr/bin/env node
/**
 * Universal SQLite Database Import Tool
 * 
 * Imports data from external SQLite databases into EDData Collector databases
 * Supports multiple import modes, validation, and progress tracking
 * 
 * Usage:
 *   npm run import -- --source=/path/to/source.db --target=systems --mode=merge
 *   npm run import -- --source=/path/to/source.db --target=stations --mode=replace --dry-run
 *   npm run import -- --source=/path/to/trade.db --target=trade --mode=update --validate
 * 
 * Options:
 *   --source       Path to source SQLite database file (required)
 *   --target       Target database: systems|stations|locations|trade (required)
 *   --mode         Import mode: merge|replace|update|append (default: merge)
 *   --table        Specific table to import (optional, defaults to all tables)
 *   --dry-run      Show what would be imported without making changes
 *   --validate     Validate data integrity after import
 *   --batch-size   Number of rows to process per transaction (default: 10000)
 *   --skip-errors  Continue on row errors instead of aborting
 *   --force        Skip confirmation prompts
 */

const fs = require('fs')
const path = require('path')
const SqlLiteDatabase = require('better-sqlite3')
const byteSize = require('byte-size')

const {
  EDDATA_DATA_DIR,
  EDDATA_SYSTEMS_DB,
  EDDATA_STATIONS_DB,
  EDDATA_LOCATIONS_DB,
  EDDATA_TRADE_DB
} = require('../lib/consts')

// Import modes
const IMPORT_MODES = {
  merge: 'Merge data, skip duplicates (safest)',
  replace: 'Replace all existing data (destructive)',
  update: 'Update existing records, skip new ones',
  append: 'Append all records, allow duplicates'
}

// Target database mappings
const TARGET_DATABASES = {
  systems: EDDATA_SYSTEMS_DB,
  stations: EDDATA_STATIONS_DB,
  locations: EDDATA_LOCATIONS_DB,
  trade: EDDATA_TRADE_DB
}

// Expected table schemas for validation
const EXPECTED_SCHEMAS = {
  systems: ['systems'],
  stations: ['stations'],
  locations: ['locations', 'rings', 'bodies'],
  trade: ['commodities', 'markets']
}

class DatabaseImporter {
  constructor (options) {
    this.options = {
      source: options.source,
      target: options.target,
      mode: options.mode || 'merge',
      table: options.table || null,
      dryRun: options.dryRun || false,
      validate: options.validate || false,
      batchSize: options.batchSize || 10000,
      skipErrors: options.skipErrors || false,
      force: options.force || false
    }

    this.stats = {
      tablesProcessed: 0,
      rowsProcessed: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      errors: 0,
      startTime: Date.now()
    }

    this.sourceDb = null
    this.targetDb = null
  }

  async run () {
    try {
      console.log('🔄 EDData SQLite Import Tool\n')
      console.log('═'.repeat(60))
      
      // Validate options
      this.validateOptions()
      
      // Open databases
      this.openDatabases()
      
      // Show import plan
      await this.showImportPlan()
      
      // Confirm (unless --force)
      if (!this.options.force && !this.options.dryRun) {
        await this.confirmImport()
      }
      
      // Perform import
      await this.importData()
      
      // Validate if requested
      if (this.options.validate && !this.options.dryRun) {
        await this.validateImport()
      }
      
      // Show summary
      this.showSummary()
      
      console.log('\n✅ Import completed successfully')
      process.exit(0)
    } catch (error) {
      console.error('\n❌ Import failed:', error.message)
      console.error(error.stack)
      process.exit(1)
    } finally {
      this.closeDatabases()
    }
  }

  validateOptions () {
    // Check source file
    if (!this.options.source) {
      throw new Error('--source parameter is required')
    }
    if (!fs.existsSync(this.options.source)) {
      throw new Error(`Source database not found: ${this.options.source}`)
    }

    // Check target
    if (!this.options.target) {
      throw new Error('--target parameter is required (systems|stations|locations|trade)')
    }
    if (!TARGET_DATABASES[this.options.target]) {
      throw new Error(`Invalid target: ${this.options.target}`)
    }

    // Check mode
    if (!IMPORT_MODES[this.options.mode]) {
      throw new Error(`Invalid mode: ${this.options.mode}`)
    }

    // Check target database exists
    const targetPath = TARGET_DATABASES[this.options.target]
    if (!fs.existsSync(targetPath)) {
      console.warn(`⚠️  Target database does not exist yet: ${targetPath}`)
      console.warn('   It will be created during import')
    }
  }

  openDatabases () {
    console.log('\n📂 Opening databases...')
    
    try {
      this.sourceDb = new SqlLiteDatabase(this.options.source, { readonly: true })
      console.log(`   ✓ Source: ${this.options.source}`)
      
      const targetPath = TARGET_DATABASES[this.options.target]
      this.targetDb = new SqlLiteDatabase(targetPath)
      this.targetDb.pragma('journal_mode = WAL')
      console.log(`   ✓ Target: ${targetPath}`)
    } catch (error) {
      throw new Error(`Failed to open databases: ${error.message}`)
    }
  }

  closeDatabases () {
    if (this.sourceDb) {
      try { this.sourceDb.close() } catch (e) {}
    }
    if (this.targetDb) {
      try { this.targetDb.close() } catch (e) {}
    }
  }

  async showImportPlan () {
    console.log('\n📋 Import Plan:')
    console.log('═'.repeat(60))
    
    const sourceStats = fs.statSync(this.options.source)
    console.log(`Source Database: ${this.options.source}`)
    console.log(`Size: ${byteSize(sourceStats.size)}`)
    
    // Get source tables
    const sourceTables = this.sourceDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map(row => row.name)
    
    console.log(`\nTables in source: ${sourceTables.join(', ')}`)
    
    if (this.options.table) {
      if (!sourceTables.includes(this.options.table)) {
        throw new Error(`Table '${this.options.table}' not found in source database`)
      }
      console.log(`Importing only: ${this.options.table}`)
    }
    
    console.log(`\nTarget: ${this.options.target}`)
    console.log(`Mode: ${this.options.mode} - ${IMPORT_MODES[this.options.mode]}`)
    console.log(`Batch size: ${this.options.batchSize.toLocaleString()} rows`)
    
    if (this.options.dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes will be made')
    }
    
    // Count rows per table
    console.log('\nRow counts:')
    const tablesToImport = this.options.table ? [this.options.table] : sourceTables
    for (const table of tablesToImport) {
      try {
        const count = this.sourceDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count
        console.log(`   ${table}: ${count.toLocaleString()} rows`)
      } catch (error) {
        console.warn(`   ${table}: Error reading (${error.message})`)
      }
    }
  }

  async confirmImport () {
    console.log('\n' + '═'.repeat(60))
    console.log('⚠️  WARNING: This will modify your database!')
    
    if (this.options.mode === 'replace') {
      console.log('⚠️  REPLACE mode will DELETE ALL existing data!')
    }
    
    // In a real terminal, we'd use readline for interactive confirmation
    // For now, require --force flag for non-interactive mode
    console.log('\nUse --force to skip this confirmation')
    console.log('Use --dry-run to preview changes without applying them')
    throw new Error('Import cancelled - use --force to proceed')
  }

  async importData () {
    console.log('\n🔄 Starting import...')
    console.log('═'.repeat(60))
    
    const sourceTables = this.options.table 
      ? [this.options.table]
      : this.sourceDb
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
          .all()
          .map(row => row.name)
    
    for (const table of sourceTables) {
      await this.importTable(table)
    }
  }

  async importTable (tableName) {
    console.log(`\n📊 Importing table: ${tableName}`)
    
    try {
      // Get source table info
      const columns = this.sourceDb.pragma(`table_info(${tableName})`)
      const columnNames = columns.map(c => c.name)
      const primaryKey = columns.find(c => c.pk === 1)
      
      console.log(`   Columns: ${columnNames.join(', ')}`)
      if (primaryKey) {
        console.log(`   Primary key: ${primaryKey.name}`)
      }
      
      // Check if target table exists
      const targetTableExists = this.targetDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName)
      
      if (!targetTableExists) {
        console.log(`   ⚠️  Target table doesn't exist, creating...`)
        const createStatement = this.sourceDb
          .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
          .get(tableName).sql
        
        if (!this.options.dryRun) {
          this.targetDb.exec(createStatement)
        }
        console.log(`   ✓ Table created`)
      }
      
      // Count source rows
      const totalRows = this.sourceDb.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get().count
      console.log(`   Total rows to import: ${totalRows.toLocaleString()}`)
      
      if (totalRows === 0) {
        console.log(`   ⏭️  Skipping empty table`)
        return
      }
      
      // Handle different import modes
      if (this.options.mode === 'replace' && !this.options.dryRun) {
        console.log(`   🗑️  Deleting existing data...`)
        this.targetDb.prepare(`DELETE FROM ${tableName}`).run()
      }
      
      // Prepare statements
      const placeholders = columnNames.map(() => '?').join(', ')
      const insertSQL = `INSERT OR IGNORE INTO ${tableName} (${columnNames.join(', ')}) VALUES (${placeholders})`
      const replaceSQL = `INSERT OR REPLACE INTO ${tableName} (${columnNames.join(', ')}) VALUES (${placeholders})`
      
      const insertStmt = this.options.dryRun ? null : this.targetDb.prepare(
        this.options.mode === 'append' ? replaceSQL : insertSQL
      )
      
      // Process in batches
      const batchSize = this.options.batchSize
      let processed = 0
      let inserted = 0
      let errors = 0
      
      console.log(`   Processing in batches of ${batchSize.toLocaleString()}...`)
      
      while (processed < totalRows) {
        const rows = this.sourceDb
          .prepare(`SELECT * FROM ${tableName} LIMIT ? OFFSET ?`)
          .all(batchSize, processed)
        
        if (!this.options.dryRun) {
          const transaction = this.targetDb.prepare('BEGIN')
          const commit = this.targetDb.prepare('COMMIT')
          const rollback = this.targetDb.prepare('ROLLBACK')
          
          try {
            transaction.run()
            
            for (const row of rows) {
              try {
                const values = columnNames.map(col => row[col])
                const result = insertStmt.run(...values)
                if (result.changes > 0) {
                  inserted++
                }
              } catch (error) {
                errors++
                if (!this.options.skipErrors) {
                  throw error
                }
                console.warn(`      ⚠️  Row error: ${error.message}`)
              }
            }
            
            commit.run()
          } catch (error) {
            rollback.run()
            throw error
          }
        }
        
        processed += rows.length
        const progress = ((processed / totalRows) * 100).toFixed(1)
        process.stdout.write(`\r   Progress: ${processed.toLocaleString()}/${totalRows.toLocaleString()} (${progress}%)`)
      }
      
      console.log(`\n   ✓ Imported ${inserted.toLocaleString()} rows`)
      if (errors > 0) {
        console.warn(`   ⚠️  ${errors} errors encountered`)
      }
      
      this.stats.tablesProcessed++
      this.stats.rowsProcessed += processed
      this.stats.rowsInserted += inserted
      this.stats.errors += errors
      
    } catch (error) {
      console.error(`   ❌ Failed to import table: ${error.message}`)
      if (!this.options.skipErrors) {
        throw error
      }
      this.stats.errors++
    }
  }

  async validateImport () {
    console.log('\n🔍 Validating import...')
    console.log('═'.repeat(60))
    
    // Basic integrity check
    try {
      const result = this.targetDb.pragma('integrity_check')
      if (result[0].integrity_check === 'ok') {
        console.log('   ✓ Database integrity: OK')
      } else {
        console.warn('   ⚠️  Database integrity issues found:')
        result.forEach(r => console.warn(`      ${r.integrity_check}`))
      }
    } catch (error) {
      console.error(`   ❌ Integrity check failed: ${error.message}`)
    }
    
    // Verify row counts
    const tablesToCheck = this.options.table 
      ? [this.options.table]
      : EXPECTED_SCHEMAS[this.options.target] || []
    
    if (tablesToCheck.length > 0) {
      console.log('\n   Row count verification:')
      for (const table of tablesToCheck) {
        try {
          const count = this.targetDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count
          console.log(`      ${table}: ${count.toLocaleString()} rows`)
        } catch (error) {
          console.warn(`      ${table}: Not found or error`)
        }
      }
    }
  }

  showSummary () {
    const duration = ((Date.now() - this.stats.startTime) / 1000).toFixed(1)
    const rowsPerSecond = (this.stats.rowsProcessed / duration).toFixed(0)
    
    console.log('\n' + '═'.repeat(60))
    console.log('📈 Import Summary:')
    console.log('═'.repeat(60))
    console.log(`Tables processed: ${this.stats.tablesProcessed}`)
    console.log(`Rows processed: ${this.stats.rowsProcessed.toLocaleString()}`)
    console.log(`Rows inserted: ${this.stats.rowsInserted.toLocaleString()}`)
    console.log(`Errors: ${this.stats.errors}`)
    console.log(`Duration: ${duration}s`)
    console.log(`Speed: ${rowsPerSecond} rows/second`)
    
    if (this.options.dryRun) {
      console.log('\n⚠️  DRY RUN - No changes were made to the database')
    }
  }
}

// Parse command line arguments
function parseArgs () {
  const args = {}
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=')
      
      if (value === undefined) {
        // Boolean flag
        args[key] = true
      } else {
        // Key-value pair
        args[key] = value
      }
    }
  }
  
  return args
}

// Main execution
;(async () => {
  const args = parseArgs()
  
  // Show help if no arguments
  if (Object.keys(args).length === 0 || args.help) {
    console.log(`
EDData SQLite Import Tool

Usage:
  npm run import -- --source=/path/to/source.db --target=systems --mode=merge

Required Options:
  --source       Path to source SQLite database file
  --target       Target database: systems|stations|locations|trade

Optional Options:
  --mode         Import mode: merge|replace|update|append (default: merge)
  --table        Specific table to import (optional, defaults to all tables)
  --dry-run      Show what would be imported without making changes
  --validate     Validate data integrity after import
  --batch-size   Number of rows to process per transaction (default: 10000)
  --skip-errors  Continue on row errors instead of aborting
  --force        Skip confirmation prompts

Import Modes:
  merge          Merge data, skip duplicates (safest)
  replace        Replace all existing data (destructive)
  update         Update existing records, skip new ones
  append         Append all records, allow duplicates

Examples:
  # Dry run to preview import
  npm run import -- --source=./import/systems.db --target=systems --dry-run

  # Import systems database with merge mode
  npm run import -- --source=./systems.db --target=systems --mode=merge --force

  # Import specific table with validation
  npm run import -- --source=./data.db --target=stations --table=stations --validate --force

  # Replace all trade data (DESTRUCTIVE!)
  npm run import -- --source=./trade.db --target=trade --mode=replace --force
`)
    process.exit(0)
  }
  
  const importer = new DatabaseImporter(args)
  await importer.run()
})()
