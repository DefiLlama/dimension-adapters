import axios, { AxiosResponse } from "axios"
import retry from "async-retry";

export async function queryFlipside(sqlQuery: string) {
  return await retry(
    async (bail, attempt) => {
      let query: undefined | AxiosResponse<any, any> = undefined
      // only runs first time
      if (attempt === 1) {
        query = await axios.post("https://node-api.flipsidecrypto.com/queries", {
          "sql": sqlQuery,
          "ttl_minutes": 15,
          "cache": true
        }, {
          headers: {
            "x-api-key": "915bc857-d8d2-4445-8c55-022ab853476e"
          }
        })
      }

      if (!query) {
        bail(new Error("Couldn't get a token from flipsidecrypto"))
        return
      }

      const results = await axios.get(`https://node-api.flipsidecrypto.com/queries/${query.data.token}`, {
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
      if (status !== "running") {
        throw new Error("Still running")
      }
    },
    {
      retries: 10,
      maxTimeout: 6000
    }
  );
}