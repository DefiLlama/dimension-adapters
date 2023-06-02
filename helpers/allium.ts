import axios, { AxiosResponse } from "axios"
import retry from "async-retry";
import { IJSON } from "../adapters/types";

const token = {} as IJSON<string>

export async function queryAllium(sqlQuery: string) {
    const HEADERS = {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.ALLIUM_API_KEY!,
    };
    return await retry(
      async (bail) => {
        let query: undefined | AxiosResponse<any, any> = undefined
        if (!token[sqlQuery]) {
          try{
            query = await axios.post(`https://api.allium.so/api/v1/explorer/queries/phBjLzIZ8uUIDlp0dD3N/run-async`, {
              parameters: {
                  fullQuery: sqlQuery
              }
            }, {
              headers: HEADERS
            })
            
            token[sqlQuery] = query?.data["run_id"];
          } catch(e){
            console.log("query run-async", e);
            throw e
          }
        }
  
        if (!token[sqlQuery]) {
          throw new Error("Couldn't get a token from flipsidecrypto")
        }
  
        const statusReq = await axios.get(`https://api.allium.so/api/v1/explorer/query-runs/${token[sqlQuery]}/status`, {
          headers: HEADERS
        })
  
        const status = statusReq.data
        if (status === "success") {
          try{
            const results = await axios.get(`https://api.allium.so/api/v1/explorer/query-runs/${token[sqlQuery]}/results?f=json`, {
                headers: HEADERS
            })
            return results.data.data
          } catch(e){
            console.log("query result", e)
            throw e
          }
        } else if (status === "failed") {
          bail(new Error(`Query ${sqlQuery} failed, error ${JSON.stringify(statusReq.data)}`))
        }
        throw new Error("Still running")
      },
      {
        retries: 20,
        maxTimeout: 1000 * 60 * 5
      }
    );
  }