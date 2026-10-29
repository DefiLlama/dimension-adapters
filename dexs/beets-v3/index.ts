import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const SUBGRAPH = 'https://api.subgraph.ormilabs.com/api/public/717cf785-de57-4761-94dd-9ac51b019902/subgraphs/v3-vault-sonic-smol/latest/gn'
const V3_VAULT = '0xbA1333333333a1BA1108E8412f11850A5C319bA9'
const DEFAULT_PROTOCOL_YIELD_FEE = 0.1
const MAX_DAILY_YIELD_RATE = 0.01
const PROTOCOL_SHARE = 0.25

const n = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Fees collected from token swaps in liquidity pools',
    'Yield capture': 'Revenue generated from yield-bearing tokens held in pools (e.g., stETH, wstETH)',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Protocol share of swap fees (25% of total swap fees)',
    'Protocol yield capture': 'Protocol share of yield capture (25% of total yield capture)',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'Liquidity provider share of swap fees and yield capture (75% of total)',
  },
};

async function sgRequest(query: string): Promise<any> {
  let error: any
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await request(SUBGRAPH, query)
    } catch (e) {
      error = e
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }
  throw error
}

async function getPoolTokens(block: number) {
  const result: any[] = []
  let lastId = ""
  while (true) {
    const query = `{
      poolTokens(first: 1000, orderBy: id, where: { id_gt: "${lastId}" }, block: { number: ${block} }) {
        id
        address
        decimals
        balance
        volume
        totalSwapFee
        totalProtocolYieldFee
        pool { address }
      }
    }`
    const { poolTokens } = await sgRequest(query)
    result.push(...poolTokens)
    if (poolTokens.length < 1000) break
    lastId = poolTokens[poolTokens.length - 1].id
  }
  return result
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()])
  const [startTokens, endTokens] = await Promise.all([getPoolTokens(fromBlock), getPoolTokens(toBlock)])

  const startTokenMap: any = {}
  startTokens.forEach((token: any) => startTokenMap[token.id] = token)

  endTokens.forEach((token: any) => {
    const prev = startTokenMap[token.id]
    const scale = 10 ** token.decimals

    const volume = (n(token.volume) - n(prev?.volume)) * scale
    if (volume > 0) dailyVolume.add(token.address, volume)

    const swapFee = (n(token.totalSwapFee) - n(prev?.totalSwapFee)) * scale
    if (swapFee > 0) {
      dailyFees.add(token.address, swapFee, METRIC.SWAP_FEES)
      dailyRevenue.add(token.address, swapFee * PROTOCOL_SHARE, METRIC.PROTOCOL_FEES)
      dailySupplySideRevenue.add(token.address, swapFee * (1 - PROTOCOL_SHARE), METRIC.LP_FEES)
    }
  })

  const yieldDeltas = endTokens
    .map((token: any) => ({
      token,
      delta: (n(token.totalProtocolYieldFee) - n(startTokenMap[token.id]?.totalProtocolYieldFee)) * 10 ** token.decimals,
      maxBalance: Math.max(n(token.balance), n(startTokenMap[token.id]?.balance)) * 10 ** token.decimals,
    }))
    .filter((i: any) => i.delta > 0)

  if (yieldDeltas.length) {
    const feeController = await options.api.call({ target: V3_VAULT, abi: 'address:getProtocolFeeController' })
    const yieldFeeInfos = await options.api.multiCall({
      target: feeController,
      abi: 'function getPoolProtocolYieldFeeInfo(address pool) view returns (uint256 feePercentage, bool isOverride)',
      calls: yieldDeltas.map((i: any) => i.token.pool.address),
      permitFailure: true,
    })

    yieldDeltas.forEach(({ token, delta, maxBalance }: any, index: number) => {
      const yieldFeeRate = yieldFeeInfos[index] ? Number(yieldFeeInfos[index].feePercentage) / 1e18 : DEFAULT_PROTOCOL_YIELD_FEE
      const yieldCaptured = delta / (yieldFeeRate > 0 ? yieldFeeRate : DEFAULT_PROTOCOL_YIELD_FEE)
      if (yieldCaptured > maxBalance * MAX_DAILY_YIELD_RATE) return
      dailyFees.add(token.address, yieldCaptured, 'Yield capture')
      dailyRevenue.add(token.address, yieldCaptured * PROTOCOL_SHARE, 'Protocol yield capture')
      dailySupplySideRevenue.add(token.address, yieldCaptured * (1 - PROTOCOL_SHARE), METRIC.LP_FEES)
    })
  }

  dailyVolume.resizeBy(0.5)

  return { dailyFees, dailyVolume, dailyRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: 'Total volume is the sum of all trades, read from the Balancer V3 vault subgraph on Sonic.',
    Fees: 'Total fees earned from all the trades and yield.',
    Revenue: 'Total revenue earned by the protocol, which is 25% of the fees and yield capture.',
    SupplySideRevenue: 'Swap fees and yield capture earned by liquidity providers, which is 75% of the fees and yield capture.',
  },
  breakdownMethodology,
  fetch,
  pullHourly: true,
  chains: [CHAIN.SONIC],
  start: '2024-12-14',
};

export default adapter;
