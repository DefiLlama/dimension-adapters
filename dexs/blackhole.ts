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

    const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
    const pairIds = Object.keys(filteredPairs)
    api.log(`uniV2RunLog: Filtered to ${pairIds.length}/${pairs.length} pairs Factory: ${Factory} Chain: ${chain}`)

    if (!pairIds.length) return { 
      dailyVolume: 0,
      dailyFees: 0,
      dailyUserFees: 0,
      dailyRevenue: 0,
      dailySupplySideRevenue: 0,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue: 0,
    }

    const lpSupplies = await fetchOptions.api.multiCall({
      abi: 'uint256:totalSupply',
      calls: pairIds,
      permitFailure: false,
    });
    const gauges = await fetchOptions.api.multiCall({
      abi: 'function gauges(address) view returns (address)',
      calls: pairIds.map(pairid => {
        return {
          target: GaugeManager,
          params: [pairid],
        }
      }),
      permitFailure: true,
    });
    const gaugeSupplies = await fetchOptions.api.multiCall({
      abi: 'uint256:totalSupply',
      calls: gauges,
      permitFailure: true,
    });

    // get swap logs
    const allLogs = await getLogs({ targets: pairIds, eventAbi: SwapEvent, flatten: false })

    const dailyVolume = createBalances()
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const dailySupplySideRevenue = createBalances()
    allLogs.map((logs: any, index) => {
      if (!logs.length) return;
      const pair = pairIds[index]
      const gaugeSupply = Number(gaugeSupplies[index] ? gaugeSupplies[index] : 0)
      const lpSupply = Number(lpSupplies[index] ? lpSupplies[index] : 0)
      const revenueRatio = lpSupply > 0 ? gaugeSupply / lpSupply : 0;
      const [token0, token1] = pairObject[pair]
      logs.forEach((log: any) => {
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })

        addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * SwapFee, amount1: Number(log.amount1In) * SwapFee })
        addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * SwapFee, amount1: Number(log.amount1Out) * SwapFee })

        addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: Number(log.amount0In) * SwapFee * revenueRatio, amount1: Number(log.amount1In) * SwapFee * revenueRatio })
        addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: Number(log.amount0Out) * SwapFee * revenueRatio, amount1: Number(log.amount1Out) * SwapFee * revenueRatio })   

        addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: Number(log.amount0In) * SwapFee * (1- revenueRatio), amount1: Number(log.amount1In) * SwapFee * (1- revenueRatio) })
        addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: Number(log.amount0Out) * SwapFee * (1- revenueRatio), amount1: Number(log.amount1Out) * SwapFee * (1- revenueRatio) })   
      })
    })

    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue: dailyRevenue,
      dailySupplySideRevenue: dailySupplySideRevenue,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue: dailyRevenue,
    }
  }
  return fetch
}

const meta = {
  methodology: {
    Fees: "All swap fees paid by users.",
    UserFees: "All swap fees paid by users.",
    SupplySideRevenue: "Unstake LPs receive 100% fee of each swap.",
    Revenue: "Fees collected and distributed to staked LPs.",
    ProtocolRevenue: "No protocol revenue",
    HoldersRevenue: "Fees collected and distributed to veBlack holders.",
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
