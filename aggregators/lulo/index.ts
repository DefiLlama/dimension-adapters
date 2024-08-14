import { Chain } from "@defillama/sdk/build/types";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";

const endpoint = "http://api.flexlend.fi/stats"
const startTimestamp = 1704067200; // 2024-01-01

type TVLEntry = {
  startDate: number,
  endDate: number,
  volume: number
}

const fetchLuloTVL = async (timestamp: number): Promise<FetchResult> => {

  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-lulo-api-key": String(process.env.LULO_API_KEY || ''),
    },
  };

  const response = await fetch(`${endpoint}?timestamp=${timestamp}`, options)

   const entry: TVLEntry = await response.json()

    return {
        totalVolume: entry.volume,
        timestamp: timestamp,
    };
}

const adapter: SimpleAdapter = {
    version: 1,
    timetravel: true,
    adapter: {
      [CHAIN.SOLANA]: {
        fetch: fetchLuloTVL,
        start: startTimestamp,
        customBackfill: customBackfill(CHAIN.SOLANA as Chain, (_chian: string) => fetchLuloTVL),
        meta: {
          methodology: 'Volume is calculated by summing the total USD value of deposited funds in Lulo across all tokens',
      }
      },
    },
  };
  
  export default adapter;