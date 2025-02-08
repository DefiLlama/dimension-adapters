import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FUEL_SUBGRAPH_URL = 'https://endpoint.sentio.xyz/1delta/fuel-subgraph/volume'
const FUEL_SUBGRAPH_API_KEY = 'mHWELZ01Oo3BRfGb0WrhFvryge78baQVT'

const createFuelVolumeFetcher = () => {
  return async ({ startTimestamp, endTimestamp }: FetchOptions) => {
    return fetch(FUEL_SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        'api-key': FUEL_SUBGRAPH_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "startTimestamp": startTimestamp,
        "endTimestamp": endTimestamp
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`)
        }
        return response.json();
      })
      .then((result) => {
        const rows = result.syncSqlResponse.result?.rows || []

        const dailyVolume = rows.reduce((acc: number, row) => acc + Number(row.volumeUsd), 0)
  
        return {
          dailyVolume,
        }
      })
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.FUEL]: { fetch: createFuelVolumeFetcher(), start: '2025-01-20' }
  },
}

export default adapter;