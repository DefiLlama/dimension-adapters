
import { Sequelize } from 'sequelize';
import { FetchOptions } from '../adapters/types';
import { getEnv } from './env';
const dbString = getEnv('INDEXA_DB')

let connection: Sequelize;

async function getConnection() {
  if (!dbString) throw new Error('INDEXA_DB not set')
  if (!connection)
    connection = new Sequelize(dbString, {
      logging: false,
      dialect: 'postgres',
      pool: { max: 5, min: 0, acquire: 30000, idle: 5000 }
    });

  await connection.authenticate()
  return connection
}

export async function queryIndexer(sql: string, options?: FetchOptions) {
  if (options) {
    const { fromTimestamp, toTimestamp } = options
    const start = new Date(fromTimestamp * 1000).toISOString()
    const end = new Date(toTimestamp * 1000).toISOString()
    sql = sql.replace(/block_time BETWEEN llama_replace_date_range/g, `block_time BETWEEN '${start}' AND '${end}'`)
  }
  // console.log('Querying indexer with:', sql)
  const conn = await getConnection();
  const results = await conn.query(sql);
  return results[0]
}

export async function closeConnection() {
  if (connection) {
    console.log('Closing connection to indexer')
    await connection.close()
    console.log('Connection closed')
  }
}

process.on('exit', closeConnection)
process.on('SIGINT', closeConnection)
process.on('SIGTERM', closeConnection)

export function toByteaArray(arr: string[], {skipBytea = false} = {}) {
  const res = arr.map((wallet) => '\'' + wallet.replace('0x', '\\x') + (skipBytea ? '\'' : '\'::bytea'))
  return `( ${res.join(', ')} )`
}