const { createHash } = require('node:crypto')

const preparedStatementsCache = {}

function generateInsertOrReplaceIntoStmt (table, keys) {
  // Generate prepared statement for table from list of keys
  return `INSERT OR REPLACE INTO ${table} (${keys.join()}) VALUES (${keys.map(key => `@${key}`).join()})`
}

function generateUpdateStmt (table, keys, condition) {
  // Generate prepared statement for table from list of keys
  return `UPDATE ${table} SET ${keys.map(key => `${key} = @${key}`).join(', ')} WHERE ${condition}`
}

function insertOrReplaceInto (db, table, object) {
  const stmt = generateInsertOrReplaceIntoStmt(table, Object.keys(object))
  const hash = createHash('sha1').update(`${db.name}/${stmt}`).digest('hex')

  if (!preparedStatementsCache[hash]) {
    preparedStatementsCache[hash] = db.prepare(stmt)
  }

  return preparedStatementsCache[hash].run(object)
}

function update (db, table, object, condition) {
  const stmt = generateUpdateStmt(table, Object.keys(object), condition)
  const hash = createHash('sha1').update(`${db.name}/${stmt}`).digest('hex')

  if (!preparedStatementsCache[hash]) {
    preparedStatementsCache[hash] = db.prepare(stmt)
  }

  return preparedStatementsCache[hash].run(object)
}

module.exports = {
  insertOrReplaceInto,
  update
}
