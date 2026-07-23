import { CHAIN } from "../helpers/chains";
import { FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { filterPools } from "../helpers/uniswap";
import { ethers } from "ethers";
import { addOneToken } from "../helpers/prices";

const poolEvent = 'event CustomPool(address indexed token0, address indexed token1, address pool)'
const customPoolEvent = 'event CustomPool(address indexed deployer, address indexed token0, address indexed token1, address pool)'
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const globalStateAbi = 'function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)'

const factory = '0x44b7fbd4d87149efa5347c451e74b9fd18e89c55'
const fromBlock = 24390427

// Algebra fee split (/1000): communityFee = pool's share to the vault (rest to LPs);
// the vault's algebraFee = protocol cut, remainder to the gauge -> voters.
const DENOM = 1000

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options

  let logs = await options.getLogs({
    target: factory,
    eventAbi: poolEvent,
    fromBlock: fromBlock,
    entireLog: true,
    cacheInCloud: true,
  })
  logs = logs.concat(await options.getLogs({
    target: factory,
    eventAbi: customPoolEvent,
    fromBlock: fromBlock,
    entireLog: true,
    cacheInCloud: true,
  }))
  const iface = new ethers.Interface([poolEvent, customPoolEvent])
  logs = logs.map((log: any) => iface.parseLog(log)?.args)

  const pairObject: IJSON<string[]> = {}
  const fees: any = {}

  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1]
  })
  let _fees = await api.multiCall({ abi: 'function fee() view returns (uint24)', calls: logs.map((log: any) => log.pool), permitFailure: true })
  _fees.forEach((fee: any, i: number) => fees[logs[i].pool] = fee / 1e6)

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()

  if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue }

  const poolIds = Object.keys(filteredPairs)
  // communityFee (vault share) varies per pool; algebraFee (protocol cut) is uniform, so read it once.
  const globalStates = await api.multiCall({ abi: globalStateAbi, calls: poolIds })
  const vaults = await api.multiCall({ abi: 'address:communityVault', calls: poolIds })
  const algebraFee = Number(await api.call({ abi: 'function algebraFee() view returns (uint16)', target: vaults[0] }))

  const shares: IJSON<{ supply: number, protocol: number, holders: number }> = {}
  poolIds.forEach((pool, i) => {
    const vaultShare = Number(globalStates[i].communityFee) / DENOM  // share to vault
    const protocol = vaultShare * (algebraFee / DENOM)               // protocol cut
    shares[pool] = { supply: 1 - vaultShare, protocol, holders: vaultShare - protocol }
  })

  const allLogs = await getLogs({ targets: poolIds, eventAbi: poolSwapEvent, flatten: false })
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = poolIds[index]
    const [token0, token1] = pairObject[pair]
    const fee = fees[pair]
    const { supply, protocol, holders } = shares[pair]
    logs.forEach((log: any) => {
      const fee0 = log.amount0.toString() * fee
      const fee1 = log.amount1.toString() * fee
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 })
      addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: fee0 * supply, amount1: fee1 * supply })
      addOneToken({ chain, balances: dailyProtocolRevenue, token0, token1, amount0: fee0 * protocol, amount1: fee1 * protocol })
      addOneToken({ chain, balances: dailyHoldersRevenue, token0, token1, amount0: fee0 * holders, amount1: fee1 * holders })
    })
  })

  dailyRevenue.addBalances(dailyProtocolRevenue)
  dailyRevenue.addBalances(dailyHoldersRevenue)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,

  methodology: {
    Fees: "All swap fees paid by traders.",
    UserFees: "All swap fees paid by traders.",
    SupplySideRevenue: "Swap fees kept by liquidity providers. Currently zero: every active pool routes 100% of its swap fees to the gauge, and LPs instead earn NOVA emissions; this is non-zero only for pools whose community fee is set below 100%.",
    Revenue: "Swap fees routed to the community vault — the veNOVA voters' share plus the protocol treasury's cut.",
    ProtocolRevenue: "The protocol treasury's cut of vault-routed swap fees (currently 1.5%).",
    HoldersRevenue: "The remaining vault-routed swap fees, distributed to veNOVA voters.",
  },
  chains: [CHAIN.ETHEREUM],
  fetch,
  pullHourly: true,
};

export default adapter;
