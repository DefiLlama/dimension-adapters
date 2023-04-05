import axios, { AxiosResponse } from "axios"
import retry from "async-retry";
import { IJSON } from "../adapters/types";

const token = {} as IJSON<string>

export async function queryFlipside(sqlQuery: string) {
  return await retry(
    async (bail) => {
      let query: undefined | AxiosResponse<any, any> = undefined
      if (!token[sqlQuery]) {
        query = await axios.post("https://node-api.flipsidecrypto.com/queries", {
          "sql": sqlQuery,
          "ttl_minutes": 15,
          "cache": true
        }, {
          headers: {
            "x-api-key": "915bc857-d8d2-4445-8c55-022ab853476e"
          }
        })
        token[sqlQuery] = query?.data.token
      }

      if (!token[sqlQuery]) {
        throw new Error("Couldn't get a token from flipsidecrypto")
      }

      const results = await axios.get(`https://node-api.flipsidecrypto.com/queries/${token[sqlQuery]}`, {
        headers: {
          "x-api-key": "915bc857-d8d2-4445-8c55-022ab853476e"
        }
      })

      const status = results.data.status
      if (status === "finished") {
        return results.data.results
      } else if (status !== "running") {
        bail(new Error(`Query ${sqlQuery} failed, error ${JSON.stringify(results.data)}`))
      }
      if (status === "running") {
        throw new Error("Still running")
      }
    },
    {
      retries: 20,
      maxTimeout: 1000 * 60 * 5
    }
  );
}