import { CHAIN } from "../helpers/chains";
import { FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { filterPools } from "../helpers/uniswap";
import { ethers } from "ethers";
import { addOneToken } from "../helpers/prices";

const poolEvent = 'event CustomPool(address indexed token0, address indexed token1, address pool)'
const customPoolEvent = 'event CustomPool(address indexed deployer, address indexed token0, address indexed token1, address pool)'
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const factory = '0x512eb749541B7cf294be882D636218c84a5e9E5F'
const fromBlock = 65218551

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options
  
  let logs = await options.getLogs({
    target: factory,
    eventAbi: poolEvent,
    fromBlock: fromBlock,
    entireLog: true,
  })
  logs = logs.concat(await options.getLogs({
    target: factory,
    eventAbi: customPoolEvent,
    fromBlock: fromBlock,
    entireLog: true,
  }))
  const iface = new ethers.Interface([poolEvent, customPoolEvent])
  logs = logs.map((log: any) => iface.parseLog(log)?.args)

  const pairObject: IJSON<string[]> = {}
  const fees: any = {}

  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1]
  })
  let _fees = await api.multiCall({ abi: 'function fee() view returns (uint24)', calls: logs.map((log: any) => log.pool) })
  _fees.forEach((fee: any, i: number) => fees[logs[i].pool] = fee / 1e6)

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue }

  const allLogs = await getLogs({ targets: Object.keys(filteredPairs), eventAbi: poolSwapEvent, flatten: false })
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = Object.keys(filteredPairs)[index]
    const [token0, token1] = pairObject[pair]
    const fee = fees[pair]
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee })
      addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee })
    })
  })
  
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: 0, dailySupplySideRevenue, dailyHoldersRevenue: dailyRevenue }
}

const meta = {
  methodology: {
    Fees: "All swap fees paid by users.",
    UserFees: "All swap fees paid by users.",
    SupplySideRevenue: "No fees distributed to LPs.",
    Revenue: "All swap fees are revenue.",
    ProtocolRevenue: "Protocol makes no revenue.",
    HoldersRevenue: "All revenue are distributed to veBlack holders.",
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      meta,
      fetch,
    },
  }
};

export default adapter;
