import axios, { AxiosResponse } from "axios"
import retry from "async-retry";
import { IJSON } from "../adapters/types";

const token = {} as IJSON<string>
const API_KEYS = process.env.DUNE_API_KEYS?.split(',') ?? ["L0URsn5vwgyrWbBpQo9yS1E3C1DBJpZh"]
let API_KEY_INDEX = 0;
const MAX_RETRIES = 20;

export async function queryDune(queryId: string, query_parameters={}) {
  return await retry(
    async (bail, _attempt: number) => {
      const API_KEY = API_KEYS[API_KEY_INDEX]
      let query: undefined | AxiosResponse<any, any> = undefined
      if (!token[queryId]) {
        try{
          query = await axios.post(`https://api.dune.com/api/v1/query/${queryId}/execute`, {
            query_parameters
          }, {
            headers: {
              "x-dune-api-key": API_KEY,
              'Content-Type': 'application/json'
            }
          })
          if(query?.data?.execution_id){
            token[queryId] = query?.data.execution_id
          } else {
            console.log("error query data", query?.data)
            throw query?.data
          }
        } catch(e:any){
          if (API_KEY_INDEX < API_KEYS.length - 1) {
            console.error('api key out of limit waiting retry next key')
            API_KEY_INDEX = API_KEY_INDEX + 1
          } else {
            const error = new Error(`there is no more api key`)
            console.error('there is no more api key')
            bail(error)
            throw e.error
          }
        }
      }

      if (!token[queryId]) {
        throw new Error("Couldn't get a token from dune")
      }

      let queryStatus = undefined
      try {
        queryStatus = await axios.get(`https://api.dune.com/api/v1/execution/${token[queryId]}/results`, {
          headers: {
            "x-dune-api-key": API_KEY
          }
        })
      } catch(e:any){
        if (API_KEY_INDEX < API_KEYS.length - 1) {
          API_KEY_INDEX = API_KEY_INDEX + 1
        } else {
          const error = new Error(`there is no more api key`)
          console.error('there is no more api key')
          bail(error)
          throw e.error
        }
      }

      if (!queryStatus) {
        const error_query_status_undefined = new Error("Query status is undefined")
        throw error_query_status_undefined;
      }


      const status = queryStatus.data.state
      if (status === "QUERY_STATE_COMPLETED") {
        return queryStatus.data.result.rows
      } else if (status === "QUERY_STATE_FAILED"){
        console.log(queryStatus.data)
        const error = new Error("Dune query failed")
        bail(error)
        throw error
      }
      throw new Error("Still running")
    },
    {
      retries: MAX_RETRIES,
      maxTimeout: 1000 * 60 * 5
    }
  );
}
