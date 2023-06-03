import axios, { AxiosResponse } from "axios"
import retry from "async-retry";
import { IJSON } from "../adapters/types";

const token = {} as IJSON<string>
const FLIPSIDE_API_KEY = process.env.FLIPSIDE_API_KEY ?? "f3b65679-a179-4983-b794-e41cf40103ed"

export async function queryFlipside(sqlQuery: string) {
  return await retry(
    async (bail) => {
      let query: undefined | AxiosResponse<any, any> = undefined
      if (!token[sqlQuery]) {
        try{
          query = await axios.post("https://api-v2.flipsidecrypto.xyz/json-rpc", 
          {
            "jsonrpc": "2.0",
            "method": "createQueryRun",
            "params": [
                {
                    "resultTTLHours": 1,
                    "maxAgeMinutes": 20,
                    "sql":sqlQuery,
                    "tags": {
                        "source": "api"
                    },
                    "dataSource": "snowflake-default",
                    "dataProvider": "flipside"
                }
            ],
            "id": 1
        }, {
            headers: {
              "x-api-key": FLIPSIDE_API_KEY,
              'Content-Type': 'application/json'
            }
          })
          token[sqlQuery] = query?.data.result.queryRun.id
        } catch(e){
          console.log("make query flipside", e)
          throw e
        }
      }

      if (!token[sqlQuery]) {
        throw new Error("Couldn't get a token from flipsidecrypto")
      }

      const queryStatus = await axios.post(`https://api-v2.flipsidecrypto.xyz/json-rpc`, {
        "jsonrpc": "2.0",
        "method": "getQueryRun",
        "params": [
          {
            "queryRunId": token[sqlQuery]
          }
        ],
        "id": 1
      }, {
        headers: {
          "x-api-key": FLIPSIDE_API_KEY
        }
      })

      const status = queryStatus.data.result.queryRun.state
      if (status === "QUERY_STATE_SUCCESS") {
        try {
          let fullRows:any[] = []
          let pageNum = 1;
          let maxPages = 1;
          while(pageNum <= maxPages){
            const results = await axios.post(`https://api-v2.flipsidecrypto.xyz/json-rpc`, {
              "jsonrpc": "2.0",
              "method": "getQueryRunResults",
              "params": [
                {
                  "queryRunId": token[sqlQuery],
                  "format": "csv",
                  "page": {
                    "number": pageNum,
                    "size": 1000
                  }
                }
              ],
              "id": 1
            }, {
              headers: {
                "x-api-key": FLIPSIDE_API_KEY
              }
            })
            if(results.data.result.rows === null){
              return [] // empty result
            }
            pageNum = results.data.result.page.currentPageNumber + 1;
            maxPages = results.data.result.page.totalPages;
            fullRows = fullRows.concat(results.data.result.rows.map((t: any[]) => t.slice(0, -1)))
          }
          return fullRows
        } catch (e) {
          console.log("flipside query results", e);
          throw e
        }
      } else if (status === "QUERY_STATE_FAILED") {
        console.log(`Flipside query ${sqlQuery} failed`, queryStatus.data)
        bail(new Error(`Query ${sqlQuery} failed, error ${JSON.stringify(queryStatus.data)}`))
        return []; // not returned but just there to make typescript happy
      }
      throw new Error("Still running")
    },
    {
      retries: 20,
      maxTimeout: 1000 * 60 * 5
    }
  );
}
