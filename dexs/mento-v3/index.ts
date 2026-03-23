import { cache } from "@defillama/sdk";
import type { FetchV2, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const FPMM_FACTORY = '0xa849b475FE5a4B5C9C3280152c7a1945b907613b';
const SWAP_EVENT = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

const fetch: FetchV2 = async ({ createBalances, getLogs, chain, api }) => {
  const cacheKey = `tvl-adapter-cache/cache/mento-v3/${chain}.json`;

  let { pools, token0s, token1s, lpFees, protocolFees } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!pools?.length) {
    pools = await api.call({ abi: 'address[]:deployedFPMMAddresses', target: FPMM_FACTORY })
    token0s = await api.multiCall({ abi: 'address:token0', calls: pools })
    token1s = await api.multiCall({ abi: 'address:token1', calls: pools })
    lpFees = (await api.multiCall({ abi: 'uint256:lpFee', calls: pools })).map(fee => Number(fee) / 10_000)
    protocolFees = (await api.multiCall({ abi: 'uint256:protocolFee', calls: pools })).map(fee => Number(fee) / 10_000)
  }

  const poolsObject: IJSON<[string, string, number, number]> = {}
  pools.forEach((pair: string, i: number) => {
    poolsObject[pair] = [token0s[i], token1s[i], lpFees[i], protocolFees[i]]
  })
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyUserFees = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const pairIds = Object.keys(poolsObject)

  if (!pairIds.length) return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue,
  }

  const allLogs = await getLogs({ targets: pairIds, eventAbi: SWAP_EVENT, flatten: false })
  allLogs.forEach((logs, index) => {
    if (!logs.length)
      return;

    const pair = pairIds[index]
    const [token0, token1, lpFee, protocolFee] = poolsObject[pair]
    const fees = lpFee + protocolFee
    logs.forEach((log) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * fees, amount1: Number(log.amount1In) * fees })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * fees, amount1: Number(log.amount1Out) * fees })
      addOneToken({ chain, balances: dailyUserFees, token0, token1, amount0: Number(log.amount0In) * fees, amount1: Number(log.amount1In) * fees })
      addOneToken({ chain, balances: dailyUserFees, token0, token1, amount0: Number(log.amount0Out) * fees, amount1: Number(log.amount1Out) * fees })
      addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: Number(log.amount0In) * lpFee, amount1: Number(log.amount1In) * lpFee })
      addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: Number(log.amount0Out) * lpFee, amount1: Number(log.amount1Out) * lpFee })
      addOneToken({ chain, balances: dailyProtocolRevenue, token0, token1, amount0: Number(log.amount0In) * protocolFee, amount1: Number(log.amount1In) * protocolFee })
      addOneToken({ chain, balances: dailyProtocolRevenue, token0, token1, amount0: Number(log.amount0Out) * protocolFee, amount1: Number(log.amount1Out) * protocolFee })
    })
  })

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CELO]: {
      fetch,
    },
    [CHAIN.MONAD]: {
      fetch,
    },
  },
  methodology: {
    Fees: "Total trading fees (LP fee + protocol fee) charged on each swap, expressed as a fraction of swap input amount.",
    UserFees: "Total trading fees (LP fee + protocol fee) charged on each swap, expressed as a fraction of swap input amount.",
    SupplySideRevenue: "LP fee portion of trading fees that remains in the pool, accruing to liquidity providers.",
    ProtocolRevenue: "Protocol fee portion of trading fees sent to the Mento protocol fee recipient.",
    Revenue: "Protocol fee portion of trading fees sent to the Mento protocol fee recipient.",
  }
}

export default adapter;
