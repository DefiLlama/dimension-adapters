import { CHAIN } from "../helpers/chains";
import { FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { cache } from "@defillama/sdk";
import { filterPools } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";

const GaugeManager = '0x59aa177312Ff6Bdf39C8Af6F46dAe217bf76CBf6';
const Factory = '0xfe926062fb99ca5653080d6c14fe945ad68c265c';
const SwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'
const SwapFee = 0.003;

const getUniV2LogAdapter: any = (): FetchV2 => {
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, chain, api } = fetchOptions

    const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${Factory}-${chain}.json`

    const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
    if (!pairs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
    const pairObject: IJSON<string[]> = {}
    pairs.forEach((pair: string, i: number) => {
      pairObject[pair] = [token0s[i], token1s[i]]
    })
    const dailyVolume = createBalances()
    const dailyFees = createBalances()
    const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
    const pairIds = Object.keys(filteredPairs)
    api.log(`uniV2RunLog: Filtered to ${pairIds.length}/${pairs.length} pairs Factory: ${Factory} Chain: ${chain}`)

    if (!pairIds.length) return { 
      dailyVolume,
      dailyFees,
      dailyUserFees: 0,
      dailyRevenue: 0,
      dailySupplySideRevenue: 0,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue: 0,
    }

    const gauges = await await fetchOptions.api.multiCall({
      abi: 'function gauges(address) view returns (address)',
      calls: pairIds.map(pairid => {
        return {
          target: GaugeManager,
          params: [pairid],
        }
      }),
      permitFailure: true,
    });

    const allLogs = await getLogs({ targets: pairIds, eventAbi: SwapEvent, flatten: false })
    allLogs.map((logs: any, index) => {
      if (!logs.length) return;
      const pair = pairIds[index]
      const gauge = gauges[index]
      const [token0, token1] = pairObject[pair]
      logs.forEach((log: any) => {
        if (gauge) {
          console.log({gauge, pair})
        }

        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })

        addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * SwapFee, amount1: Number(log.amount1In) * SwapFee })
        addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * SwapFee, amount1: Number(log.amount1Out) * SwapFee })
      })
    })

    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue: 0,
      dailySupplySideRevenue: 0,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue: 0,
    }
  }
  return fetch
}

const meta = {
  methodology: {
    Fees: "All swap fees paid by users.",
    UserFees: "All swap fees paid by users.",
    SupplySideRevenue: "LPs receive 100% fee of each swap.",
    Revenue: "No revenue",
    ProtocolRevenue: "No protocol revenue",
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      meta,
      fetch: getUniV2LogAdapter(),
    },
  }
};

export default adapter;
