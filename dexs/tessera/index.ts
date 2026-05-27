// Program: TessVdML9pBGgG9yGks7o4HewRaXVAMuoVj4x83GLQH

import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    select 
      sum(amount_usd) as daily_volume
    from dex_solana.trades
    where project = 'tessera'
    and TIME_RANGE
  `;
  const data = await queryDuneSql(options, query)

  return {
    dailyVolume: data[0]?.daily_volume ?? 0
  }
}

const TESSERA_SWAP_ADDRESS = "0x55555522005BcAE1c2424D474BfD5ed477749E3e"
const SwapEvent = "event TesseraTrade(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address recipient)"

const fetchEvm = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances()

  const logs = await options.getLogs({
    target: TESSERA_SWAP_ADDRESS,
    eventAbi: SwapEvent,
  })

  for (const log of logs) {
    dailyVolume.add(log.tokenIn, log.amountIn)
  }

  return { dailyVolume }
}

const methodology = {
  Volume: "Volume is calculated from swap events on Tessera contracts.",
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2025-06-11',
    },
    [CHAIN.BASE]: {
      fetch: fetchEvm,
      start: '2025-10-30',
    },
    [CHAIN.BSC]: {
      fetch: fetchEvm,
      start: '2025-11-13',
    },
  },
  dependencies: [Dependencies.DUNE],
  methodology,
  isExpensiveAdapter: true,
}

export default adapter
