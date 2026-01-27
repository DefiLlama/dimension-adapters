import { Dependencies, FetchOptions } from "../adapters/types"
import { queryAllium } from "./allium"
import { CHAIN } from "./chains"


export function alliumSolanaDexExport(dex_id: string, protocol: string, start: string) {
  const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = `
      SELECT 
        SUM(usd_amount) as dailyvolume
      FROM solana.dex.trades
      WHERE project = '${dex_id}'
        AND protocol = '${protocol}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
        AND block_timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')
      `
    const data = await queryAllium(query)
    return {
      dailyVolume: data[0]?.dailyvolume ?? 0
    }
  }

  return {
    fetch,
    chains: [CHAIN.SOLANA],
    start,
    dependencies: [Dependencies.ALLIUM],
  }
}