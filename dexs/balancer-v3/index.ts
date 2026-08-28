import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// public balancer v3 vault subgraphs, from https://docs.balancer.fi/data-and-analytics/data-and-analytics/subgraph.html
const v3ChainConfig: any = {
  // start = first full UTC day at/after each vault subgraph's first indexed block
  // (querying a block before the subgraph start block fails with "only has data starting at block ...")
  [CHAIN.ETHEREUM]: { slug: "mainnet", start: '2024-12-05' },
  [CHAIN.XDAI]: { slug: "gnosis", start: '2024-12-05' },
  [CHAIN.ARBITRUM]: { slug: "arbitrum-one", start: '2025-01-22' },
  [CHAIN.OPTIMISM]: { slug: "optimism", start: '2025-04-02' },
  [CHAIN.AVAX]: { slug: "avalanche", start: '2025-04-10' },
  [CHAIN.BASE]: { slug: "base", start: '2025-01-22' },
  [CHAIN.HYPERLIQUID]: { slug: "hyperevm", start: '2025-06-19' },
  [CHAIN.PLASMA]: { slug: "plasma", start: '2025-09-13' },
  [CHAIN.MONAD]: { slug: "monad", start: '2026-01-14' },
};

const endpoint = (chain: string) => `https://api.subgraph.ormilabs.com/api/public/717cf785-de57-4761-94dd-9ac51b019902/subgraphs/v3-vault-${v3ChainConfig[chain].slug}-smol/latest/gn`

const V3_VAULT = '0xbA1333333333a1BA1108E8412f11850A5C319bA9'
const DEFAULT_PROTOCOL_YIELD_FEE = 0.1
// yield capture above 1% of the token pool balance per day means a broken rate provider or a
// rebasing token gone wild (e.g. the collapsed Stream xUSD-vgUSDC pool), skip those
const MAX_DAILY_YIELD_RATE = 0.01

const TOKENOMICS_REVAMP_DATE = "2026-04-23";

const n = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);

async function sgRequest(url: string, query: string): Promise<any> {
  let error: any
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await request(url, query)
    } catch (e) {
      error = e
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }
  throw error
}

async function getPoolTokens(url: string, block: number) {
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
    const { poolTokens } = await sgRequest(url, query)
    result.push(...poolTokens)
    if (poolTokens.length < 1000) break
    lastId = poolTokens[poolTokens.length - 1].id
  }
  return result
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();

  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const HOLDERS_SHARE_OF_PROTOCOL = options.dateString >= TOKENOMICS_REVAMP_DATE ? 0 : 0.825;
  const LP_SHARE_OF_SWAP_FEES = options.dateString >= TOKENOMICS_REVAMP_DATE ? 0.75 : 0.5;

  const url = endpoint(options.chain)
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()])
  const [startTokens, endTokens] = await Promise.all([
    getPoolTokens(url, fromBlock),
    getPoolTokens(url, toBlock),
  ])

  const startTokenMap: any = {}
  startTokens.forEach((token: any) => startTokenMap[token.id] = token)

  endTokens.forEach((token: any) => {
    const prev = startTokenMap[token.id]
    const scale = 10 ** token.decimals

    // volume counter increases on both the in and out side of every swap, halved after the loop
    const volume = (n(token.volume) - n(prev?.volume)) * scale
    if (volume > 0) dailyVolume.add(token.address, volume);

    // swap fees, subgraph counters are cumulative and normalized by token decimals
    const swapFee = (n(token.totalSwapFee) - n(prev?.totalSwapFee)) * scale
    if (swapFee > 0) {
      dailyFees.add(token.address, swapFee, METRIC.SWAP_FEES);
      dailyUserFees.add(token.address, swapFee, METRIC.SWAP_FEES);

      dailySupplySideRevenue.add(token.address, swapFee * LP_SHARE_OF_SWAP_FEES, METRIC.SWAP_FEES);
      dailyRevenue.add(token.address, swapFee * (1-LP_SHARE_OF_SWAP_FEES), METRIC.SWAP_FEES);
      dailyHoldersRevenue.add(token.address, swapFee * (1-LP_SHARE_OF_SWAP_FEES) * HOLDERS_SHARE_OF_PROTOCOL, METRIC.SWAP_FEES);
      dailyProtocolRevenue.add(token.address, swapFee * (1-LP_SHARE_OF_SWAP_FEES) * (1-HOLDERS_SHARE_OF_PROTOCOL), METRIC.SWAP_FEES);
    }
  })

  // the vault only records the protocol cut of yield fees, back out the total captured yield with the
  // pool fee rate; the subgraph protocolYieldFee field is unreliable (reports 0 on monad while fees
  // accrue), so read the actual rates from the on-chain protocol fee controller
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
      if (yieldCaptured > maxBalance * MAX_DAILY_YIELD_RATE) return;
      dailyFees.add(token.address, yieldCaptured, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(token.address, yieldCaptured * 0.9, METRIC.ASSETS_YIELDS); // 90% of yield capture goes to the supply side
      dailyRevenue.add(token.address, yieldCaptured * 0.1, METRIC.ASSETS_YIELDS);
      dailyHoldersRevenue.add(token.address, yieldCaptured * 0.1 * HOLDERS_SHARE_OF_PROTOCOL, METRIC.ASSETS_YIELDS);
      dailyProtocolRevenue.add(token.address, yieldCaptured * 0.1 * (1-HOLDERS_SHARE_OF_PROTOCOL), METRIC.ASSETS_YIELDS);
    })
  }

  dailyVolume.resizeBy(0.5)

  return {
    dailyFees,
    dailyUserFees,
    dailyVolume,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: Object.keys(v3ChainConfig).map((chain: string) => [chain, { start: v3ChainConfig[chain].start }]),
  methodology: {
    Fees: "Fees earned from all the trades and yields.",
    UserFees: "Fees earned from all the trades.",
    Revenue:
      "Revenue earned by the protocol and holders, which is 25% ( 50 % before 2026-04-23 ) of the trade fees and 10% of the yield capture.",
    ProtocolRevenue:
      "Revenue earned by the protocol, which is 25% ( 8.75% before 2026-04-23 ) of the trade fees and 10% of the yield capture.",
    HoldersRevenue:
      "Portion of protocol revenue distributed to token holders (e.g., veBAL/BAL) (82.5 % of revenue before 2026-04-23, 0 % of revenue after )",
    SupplySideRevenue:
      "Revenue earned by the supply side, which is 90% of the yield capture and 75% ( 50 % before 2026-04-23 ) of the fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by users from all trades.",
      [METRIC.ASSETS_YIELDS]: "Yields captured from all assets in liquidity pools.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by users from all trades.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "Protocol + holders share of swap fees (25%, 50% before 2026-04-23).",
      [METRIC.ASSETS_YIELDS]: "10% of yield capture taken as protocol + holders revenue.",
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "Protocol treasury share of swap fees.",
      [METRIC.ASSETS_YIELDS]: "Protocol treasury share of yield capture.",
    },
    HoldersRevenue: {
      [METRIC.SWAP_FEES]: "veBAL/BAL holders share of swap fees (0% after 2026-04-23).",
      [METRIC.ASSETS_YIELDS]: "veBAL/BAL holders share of yield capture (0% after 2026-04-23).",
    },
    SupplySideRevenue: {
      [METRIC.SWAP_FEES]: "LP share of swap fees (75%, 50% before 2026-04-23).",
      [METRIC.ASSETS_YIELDS]: "90% of yield capture distributed to LPs.",
    },
  },
};

export default adapter;
