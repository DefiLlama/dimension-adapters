import retry from "async-retry";
import { IJSON } from "../adapters/types";
import { httpGet, httpPost } from "../utils/fetchURL";
import { getEnv } from "./env";

const token = {} as IJSON<string>
const API_KEYS =getEnv('DUNE_API_KEYS')?.split(',') ?? ["L0URsn5vwgyrWbBpQo9yS1E3C1DBJpZh"]
let API_KEY_INDEX = 0;

const MAX_RETRIES = 6 * API_KEYS.length + 3;

export async function queryDune(queryId: string, query_parameters = {}) {
  /* const error = new Error("Dune: queryId is required")
  delete error.stack
  throw error */
  return await retry(
    async (bail, attempt: number) => {
      const API_KEY = API_KEYS[API_KEY_INDEX]
      let query: undefined | any = undefined
      if (!token[queryId]) {
        try {
          query = await httpPost(`https://api.dune.com/api/v1/query/${queryId}/execute`, { query_parameters }, {
            headers: {
              "x-dune-api-key": API_KEY,
              'Content-Type': 'application/json'
            }
          })
          if (query?.execution_id) {
            token[queryId] = query?.execution_id
          } else {
            console.log("error query data", query)
            throw query
          }
        } catch (e: any) {
          if (API_KEY_INDEX < API_KEYS.length - 1) {
            console.error('api key out of limit waiting retry next key')
            API_KEY_INDEX = API_KEY_INDEX + 1
          } else {
            const error = new Error(`Dune: there is no more api key`)
            console.error(error.message, e?.message)
            bail(error)
            throw error
          }
        }
      }

      if (!token[queryId]) {
        const error = new Error("Couldn't get a token from dune")
        delete error.stack
        throw error
      }

      let queryStatus = undefined
      try {
        queryStatus = await httpGet(`https://api.dune.com/api/v1/execution/${token[queryId]}/results?limit=5`, {
          headers: {
            "x-dune-api-key": API_KEY
          }
        })
      } catch (e: any) {
        if (API_KEY_INDEX < API_KEYS.length - 1) {
          API_KEY_INDEX = API_KEY_INDEX + 1
        } else {
          const error = new Error(`there is no more api key`)
          console.error('there is no more api key')
          bail(error)
          throw e
        }
      }

      if (!queryStatus) {
        const error_query_status_undefined = new Error("Query status is undefined")
        throw error_query_status_undefined;
      }


      const status = queryStatus.state
      if (["QUERY_STATE_PENDING", "QUERY_STATE_EXECUTING"].includes(status) && MAX_RETRIES === attempt) {
        const url = `https://api.dune.com/api/v1/execution/${token[queryId]}/cancel`
        await httpPost(url, {}, {
          headers: {
            "x-dune-api-key": API_KEY
          }
        })
        console.error('Dune query cancelled', token[queryId])
        bail(new Error("Dune query cancelled"))
        throw new Error("Dune query cancelled")
      }
      if (status === "QUERY_STATE_COMPLETED") {
        return queryStatus.result.rows
      } else if (status === "QUERY_STATE_FAILED") {
        console.log(queryStatus)
        const error = new Error("Dune query failed")
        bail(error)
        throw error
      }
      throw new Error("Still running")
    },
    {
      retries: MAX_RETRIES,
      minTimeout: 1000 * 15,
      maxTimeout: 1000 * 60 * 5
    }
  );
}
