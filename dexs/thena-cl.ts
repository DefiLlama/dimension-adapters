import { CHAIN } from "../helpers/chains";
import { FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { filterPools } from "../helpers/uniswap";
import { ethers } from "ethers";
import { addOneToken } from "../helpers/prices";

const poolEvent = 'event Pool(address indexed token0, address indexed token1, address pool)'
const customPoolEvent = 'event CustomPool(address indexed deployer, address indexed token0, address indexed token1, address pool)'
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'

const factory = '0x30055F87716d3DFD0E5198C27024481099fB4A98'
const fromBlock = 44121855

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options

  let logs = await getLogs({
    target: factory,
    eventAbi: poolEvent,
    fromBlock: fromBlock,
    entireLog: true,
  })
  logs = logs.concat(await getLogs({
    target: factory,
    eventAbi: customPoolEvent,
    fromBlock: fromBlock,
    entireLog: true,
  }))
  const iface = new ethers.Interface([poolEvent, customPoolEvent, poolSwapEvent])
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
      const [amount0, amount1] = [log[2], log[3]]
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: amount0.toString() * fee, amount1: amount1.toString() * fee })
      addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: amount0.toString() * fee, amount1: amount1.toString() * fee })
    })
  })

  return { 
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "All swap fees paid by users.",
    UserFees: "All swap fees paid by users.",
    SupplySideRevenue: "No fees distributed to LPs.",
    Revenue: "All swap fees are revenue.",
    ProtocolRevenue: "Protocol makes no revenue.",
    HoldersRevenue: "All revenue are distributed to veBlack holders.",
  },
  chains: [CHAIN.BSC],
  fetch,
};

export default adapter;
