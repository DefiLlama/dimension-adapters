import axios from "axios"
import { getEnv } from "./env";
import * as fs from 'fs';
import * as path from 'path';
import { elastic } from "@defillama/sdk";

const API_KEY = getEnv('DUNE_API_KEYS')?.split(',')[0] ?? "L0URsn5vwgyrWbBpQo9yS1E3C1DBJpZh"

const axiosDune = axios.create({
  headers: {
    "x-dune-api-key": API_KEY,
  },
  baseURL: 'https://api.dune.com/api/v1',
})


const NOW_TIMESTAMP = Math.trunc((Date.now()) / 1000)

const getLatestData = async (queryId: string) => {

  try {
    const { data: latest_result } = await axiosDune.get(`/query/${queryId}/results`)
    const submitted_at = latest_result.submitted_at
    const submitted_at_timestamp = Math.trunc(new Date(submitted_at).getTime() / 1000)
    const diff = NOW_TIMESTAMP - submitted_at_timestamp
    if (diff < 60 * 60 * 3) {
      return latest_result.result.rows
    }
    return undefined
  } catch (e: any) {
    throw e;
  }
}


async function randomDelay() {
  const delay = Math.floor(Math.random() * 5) + 2
  return new Promise((resolve) => setTimeout(resolve, delay * 1000))
}

const inquiryStatus = async (execution_id: string, queryId: string) => {

  let _status = undefined;
  do {
    try {
      const { data } = await axiosDune.get(`/execution/${execution_id}/status`)
      _status = data.state
      if (['QUERY_STATE_PENDING', 'QUERY_STATE_EXECUTING'].includes(_status)) {
        console.info(`waiting for query id ${queryId} to complete...`)
        await randomDelay() // 1 - 4s
      }
    } catch (e: any) {
      throw e;
    }
  } while (_status !== 'QUERY_STATE_COMPLETED' && _status !== 'QUERY_STATE_FAILED');
  return _status
}

const submitQuery = async (queryId: string, query_parameters = {}) => {

  const { data: query} = await axiosDune.post(`/query/${queryId}/execute`, { query_parameters })
  if (query?.execution_id) {
    return query?.execution_id
  } else {
    console.log("query", query)
    throw new Error("error query data: " + query)
  }
}


export const queryDune = async (queryId: string, query_parameters: any = {}) => {
  const metadata: any = {
    application: "dune",
    query_parameters,
  }
  let success = false
  let startTime = +Date.now() / 1e3

  try {
    if (Object.keys(query_parameters).length === 0) {
      const latest_result = await getLatestData(queryId)
      if (latest_result !== undefined) return latest_result
    }
    const execution_id = await submitQuery(queryId, query_parameters)
    const _status = await inquiryStatus(execution_id, queryId)
    if (_status === 'QUERY_STATE_COMPLETED') {
      const { data: { result: { rows, metadata: { column_names, column_types, ...duneMetadata } }, ...restMetadata } } = await axiosDune.get(`/execution/${execution_id}/results?limit=100000`)
      success = true
      let endTime = +Date.now() / 1e3

      await elastic.addRuntimeLog({
        runtime: endTime - startTime, success, metadata: {
          ...restMetadata,
          ...duneMetadata,
          ...metadata,
          rows: rows?.length,
        },
      })
      return rows
    } else if (_status === "QUERY_STATE_FAILED") {
      if (query_parameters.fullQuery) {
        console.log(`Dune query: ${query_parameters.fullQuery}`)
      } else {
        console.log("Dune parameters", query_parameters)
      }
      throw new Error(`Dune query failed: ${queryId}`)
    } else {
      throw new Error(`Dune query failed: ${queryId} unknown state: ${_status}`)
    }

  } catch (e: any) {
    let endTime = +Date.now() / 1e3
    await elastic.addRuntimeLog({ runtime: endTime - startTime, success, metadata, })
    await elastic.addErrorLog({ error: (e?.toString()) as any, metadata, })

    if (e.isAxiosError) {
      let specificErrorMessage = e.message;
      if (e.status === 401) {
        specificErrorMessage = "Dune API Key is invalid";
      }
      const newErr = new Error(e.message);
      (newErr as any).axiosError = specificErrorMessage;
      throw newErr;
    }
    throw e;
  }
}

const tableName = {
  bsc: "bnb",
  ethereum: "ethereum",
  base: "base",
  avax: "avalanche_c"
} as any

export const queryDuneSql = (options: any, query: string) => {

  return queryDune("3996608", {
    fullQuery: query.replace("CHAIN", tableName[options.chain] ?? options.chain).split("TIME_RANGE").join(`block_time >= from_unixtime(${options.startTimestamp})
  AND block_time <= from_unixtime(${options.endTimestamp})`)
  })
}

export const getSqlFromFile = (sqlFilePath: string, variables: Record<string, any> = {}): string => {
  try {
    const absolutePath = path.resolve(__dirname, '..', sqlFilePath);
    let sql = fs.readFileSync(absolutePath, 'utf8');

    // Replace variables
    Object.entries(variables).forEach(([key, value]) => {
      sql = sql.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    });

    return sql;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`SQL file not found: ${sqlFilePath}`);
    }
    throw new Error(`Error processing SQL file ${sqlFilePath}: ${error.message}`);
  }
}
