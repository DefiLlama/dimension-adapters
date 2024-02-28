import retry from "async-retry";
import { IJSON } from "../adapters/types";
import { httpGet, httpPost } from "../utils/fetchURL";
import { getEnv } from "./env";
const plimit = require('p-limit');
const limit = plimit(1);

const token = {} as IJSON<string>
const API_KEYS =getEnv('DUNE_API_KEYS')?.split(',') ?? ["L0URsn5vwgyrWbBpQo9yS1E3C1DBJpZh"]
let API_KEY_INDEX = 0;

const MAX_RETRIES = 6 * API_KEYS.length + 3;
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
    return null
  }
}

const inquiryStatus = async (queryId: string) => {
  let _status = undefined;
  do {
    try {
      _status = (await limit(() => httpGet(`https://api.dune.com/api/v1/execution/${token[queryId]}/status`, {
        headers: {
          "x-dune-api-key": API_KEYS[API_KEY_INDEX]
        }
      }))).state
    } catch (e: any) {
      return 'QUERY_STATE_FAILED';
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
        console.log("error query data", query)
        return null
      }
    } catch (e: any) {
      return null;
    }
  }
}


export const queryDune = async (queryId: string, query_parameters = {}) => {
  return await retry(async (bail: any, attempt: number) => {
    if (Object.keys(query_parameters).length === 0) {
      let latest_result = undefined
      while (latest_result === undefined) {
        latest_result = await getLatestData(queryId)
        if (latest_result === undefined) break;
        if (latest_result === null) {
          if (API_KEY_INDEX < API_KEYS.length - 1) {
            console.error('api key out of limit waiting retry next key')
            API_KEY_INDEX = API_KEY_INDEX + 1
            latest_result = undefined
          } else {
            bail(new Error("GetLatestData Dune: there is no more api key"))
          }
        }
      }
      return latest_result
    }

    let execute = undefined;
    while (execute === undefined) {
      execute = await submitQuery(queryId, query_parameters)
      if (execute === null) {
        if (API_KEY_INDEX < API_KEYS.length - 1) {
          console.error('api key out of limit waiting retry next key')
          API_KEY_INDEX = API_KEY_INDEX + 1
          execute = undefined
        } else {
          bail(new Error("SubmitQuery Dune: there is no more api key"))
        }
      }
    }

    let _status = undefined
    while (_status === undefined) {
      _status = await inquiryStatus(queryId)
      if (_status === 'QUERY_STATE_FAILED') {
        if (API_KEY_INDEX < API_KEYS.length - 1) {
          console.error('api key out of limit waiting retry next key')
          API_KEY_INDEX = API_KEY_INDEX + 1
          _status = undefined
        } else {
          bail(new Error("InquiryStatus Dune: there is no more api key"))
        }
      }
      if (_status === 'QUERY_STATE_COMPLETED') {
        break;
      }
      if (MAX_RETRIES === attempt) {
        bail(new Error("Dune query cancelled"))
      }
    }

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
        bail(new Error("Execution Dune: error query data: " + e.message))
      }
    }
  }, {
    retries: MAX_RETRIES,
    maxTimeout: 1000 * 60 * 5
  })
}
