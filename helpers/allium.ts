import retry from "async-retry";
import { IJSON } from "../adapters/types";
import { httpGet, httpPost } from "../utils/fetchURL";
import { getEnv } from "./env";

const token = {} as IJSON<string>

const HEADERS = {
  "Content-Type": "application/json",
  "X-API-KEY": getEnv('ALLIUM_API_KEY'),
};

export async function startAlliumQuery(sqlQuery: string) {
  const query =  await httpPost(`https://api.allium.so/api/v1/explorer/queries/phBjLzIZ8uUIDlp0dD3N/run-async`, {
    parameters: {
        fullQuery: sqlQuery
    }
  }, {
    headers: HEADERS
  })

  return query["run_id"]
}

export async function retrieveAlliumResults(queryId: string) {
  const results = await httpGet(`https://api.allium.so/api/v1/explorer/query-runs/${queryId}/results?f=json`, {
    headers: HEADERS
  })
  return results.data
}

export async function queryAllium(sqlQuery: string) {
    return await retry(
      async (bail) => {
        if (!token[sqlQuery]) {
          try{
            token[sqlQuery] = await startAlliumQuery(sqlQuery);
          } catch(e){
            console.log("query run-async", e);
            throw e
          }
        }
  
        if (!token[sqlQuery]) {
          throw new Error("Couldn't get a token from allium")
        }
  
        const statusReq = await httpGet(`https://api.allium.so/api/v1/explorer/query-runs/${token[sqlQuery]}/status`, {
          headers: HEADERS
        })
  
        const status = statusReq
        if (status === "success") {
          return retrieveAlliumResults(token[sqlQuery])
        } else if (status === "failed") {
          console.log(`Query ${sqlQuery} failed`, statusReq.data)
          bail(new Error(`Query ${sqlQuery} failed, error ${JSON.stringify(statusReq.data)}`))
          return;
        }
        throw new Error("Still running")
      },
      {
        retries: 20,
        maxTimeout: 1000 * 60 * 5
      }
    );
  }
