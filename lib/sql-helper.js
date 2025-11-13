const crypto = require('crypto')

const preparedStatementsCache = {}

function generateInsertOrReplaceIntoStmt (table, keys) {
  // Generate prepard statement for table from list of keys
  return `
INSERT OR REPLACE INTO ${table} (${keys.join()})
VALUES (${keys.map(key => `@${key}`).join()})
  `.trim()
}

function generateUpdateStmt (table, keys, condition) {
  // Generate prepard statement for table from list of keys
  return `
UPDATE ${table}
SET ${keys.map(key => `${key} = @${key}`).join(', ')}
WHERE ${condition}
  `.trim()
}

function insertOrReplaceInto (db, table, object) {
  const stmt = generateInsertOrReplaceIntoStmt(table, Object.keys(object))
  const hash = crypto.createHash('sha1').update(`${db.name}/${stmt}`).digest('hex')

  if (!preparedStatementsCache[hash]) {
    // Create cache of prepare statement if it has not been created already
    preparedStatementsCache[hash] = db.prepare(stmt)
  }

  // Run prepared statement
  return preparedStatementsCache[hash].run(object)
}

function update (db, table, object, condition) {
  const stmt = generateUpdateStmt(table, Object.keys(object), condition)
  const hash = crypto.createHash('sha1').update(`${db.name}/${stmt}`).digest('hex')

  if (!preparedStatementsCache[hash]) {
    // Create cache of prepare statement if it has not been created already
    preparedStatementsCache[hash] = db.prepare(stmt)
  }

  // Run prepared statement
  return preparedStatementsCache[hash].run(object)
}

module.exports = {
  insertOrReplaceInto,
  update
}
