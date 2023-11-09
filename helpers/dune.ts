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
          if(e?.response?.statusText === 'Payment Required'){
            if(API_KEY_INDEX < (API_KEYS.length-1)){
              const nextIndex = API_KEYS.findIndex(k=>k===API_KEY) + 1
              if(API_KEY_INDEX < nextIndex){
                API_KEY_INDEX = nextIndex;
              }
              throw "Increasing API_KEY_INDEX";
            } else {
              const error = new Error(`Payment Required`)
              bail(error)
              throw error
            }
          }
        }
      }

      if (!token[queryId]) {
        throw new Error("Couldn't get a token from dune")
      }

      const queryStatus = await axios.get(`https://api.dune.com/api/v1/execution/${token[queryId]}/results`, {
        headers: {
          "x-dune-api-key": API_KEY
        }
      })

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
