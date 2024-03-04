import { IJSON } from "../adapters/types";
import { httpGet, httpPost } from "../utils/fetchURL";
import { getEnv } from "./env";
const plimit = require('p-limit');
const limit = plimit(1);

const token = {} as IJSON<string>
const API_KEYS =getEnv('DUNE_API_KEYS')?.split(',') ?? ["L0URsn5vwgyrWbBpQo9yS1E3C1DBJpZh"]
let API_KEY_INDEX = 0;

const NOW_TIMESTAMP = Math.trunc((Date.now()) / 1000)

const getLatestData = async (queryId: string) => {
  const url = `https://api.dune.com/api/v1/query/${queryId}/results`
  try {
    const latest_result = (await limit(() => httpGet(url, {
      headers: {
        "x-dune-api-key": API_KEYS[API_KEY_INDEX]
      }
    })))
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
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const inquiryStatus = async (queryId: string) => {
  let _status = undefined;
  if (token[queryId] === undefined) throw new Error("execution is not undefined.")
  do {
    try {
      _status = (await limit(() => httpGet(`https://api.dune.com/api/v1/execution/${token[queryId]}/status`, {
        headers: {
          "x-dune-api-key": API_KEYS[API_KEY_INDEX]
        }
      }))).state
      if (['QUERY_STATE_PENDING', 'QUERY_STATE_EXECUTING'].includes(_status)) {
        console.info(`waiting for query id ${queryId} to complete...`)
        await delay(5000) // 5s
      }
    } catch (e: any) {
      throw e;
    }
  } while (_status !== 'QUERY_STATE_COMPLETED' && _status !== 'QUERY_STATE_FAILED');
  return _status
}

const submitQuery = async (queryId: string, query_parameters = {}) => {
    let query: undefined | any = undefined
    if (!token[queryId]) {
      try {
        query = await limit(() => httpPost(`https://api.dune.com/api/v1/query/${queryId}/execute`, { query_parameters }, {
          headers: {
            "x-dune-api-key": API_KEYS[API_KEY_INDEX],
            'Content-Type': 'application/json'
          }
        }))
        if (query?.execution_id) {
          token[queryId] = query?.execution_id
        } else {
          throw new Error("error query data: " + query)
        }
      } catch (e: any) {
        throw e;
      }
  }
}


export const queryDune = async (queryId: string, query_parameters = {}) => {
    if (Object.keys(query_parameters).length === 0) {
      const latest_result = await getLatestData(queryId)
      if (latest_result !== undefined) return latest_result
    }
    await submitQuery(queryId, query_parameters)
    const _status = await inquiryStatus(queryId)
    if (_status === 'QUERY_STATE_COMPLETED') {
      const API_KEY = API_KEYS[API_KEY_INDEX]
      try {
        const queryStatus = await limit(() => httpGet(`https://api.dune.com/api/v1/execution/${token[queryId]}/results?limit=5&offset=0`, {
          headers: {
            "x-dune-api-key": API_KEY
          }
        }))
        return queryStatus.result.rows
      } catch (e: any) {
        throw e;
      }
    }
}
