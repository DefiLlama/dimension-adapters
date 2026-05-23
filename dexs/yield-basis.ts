import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const ABI = {
  market_count: "uint256:market_count",
  admin_fee: "uint256:admin_fee",
  coins: "function coins(uint256) view returns(address)",
  markets: "function markets(uint256 arg0) view returns ((address asset_token, address cryptopool, address amm, address lt, address price_oracle, address virtual_pool, address staker))",
  TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 price_oracle)',
}

interface IFactory {
  factory: string;
  start: string;
}

interface IPool {
  pool: string;
  adminFee: bigint;
  coins: Array<string>;
}

const ADMIN_FEE_DENOMINATOR = 20_000_000_000n;

const FactoryConfigs: Record<string, IFactory> = {
  [CHAIN.ETHEREUM]: {
    factory: '0x370a449FeBb9411c95bf897021377fe0B7D100c0',
    start: '2025-09-24',
  }
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const markets: Array<any> = await options.api.fetchList({ lengthAbi: ABI.market_count, itemAbi: ABI.markets, target: FactoryConfigs[options.chain].factory })
  const ammAddresses: Array<string> = markets.map((m: any) => m.amm)
  
  if (ammAddresses.length > 0) {
    const calls: Array<any> = []
    for (const amm of ammAddresses) {
      calls.push({ target: amm, params: [0] })
      calls.push({ target: amm, params: [1] })
    }
    const coins: Array<string> = await options.api.multiCall({
      abi: ABI.coins,
      calls,
    })
    const admin_fees: Array<any> = await options.api.multiCall({
      abi: ABI.admin_fee,
      calls: ammAddresses,
      permitFailure: true,
    })
    
    const pools: Array<IPool> = []
    for (let i = 0; i < ammAddresses.length; i++) {
      pools.push({
        pool: ammAddresses[i],
        coins: [coins[i * 2], coins[i * 2 + 1]],
        adminFee: BigInt(admin_fees[i] ?? 0),
      })
    }
    
    const swapLogs: Array<Array<any>> = await options.getLogs({
      targets: pools.map(p => p.pool),
      eventAbi: ABI.TokenExchange,
      flatten: false,
    })
    for (let i = 0; i < pools.length; i++) {
      for (const log of swapLogs[i]) {
        // log.fee is the fee rate (self.fee), 1e18-denominated, NOT the token amount.
        // Actual fee in output token = tokens_bought * feeRate / (1e18 - feeRate).
        const feeRate = BigInt(log.fee)
        const tokensOut = BigInt(log.tokens_bought)
        const fee = tokensOut * feeRate / (10n ** 18n - feeRate)
        const adminFee = fee * pools[i].adminFee / ADMIN_FEE_DENOMINATOR
        const supplySideFee = fee - adminFee
        const feeToken = pools[i].coins[Number(log.bought_id)]

        dailyVolume.add(pools[i].coins[Number(log.sold_id)], log.tokens_sold)
        dailyFees.add(feeToken, fee, METRIC.SWAP_FEES)
        dailyRevenue.add(feeToken, adminFee, METRIC.PROTOCOL_FEES)
        dailySupplySideRevenue.add(feeToken, supplySideFee, METRIC.LP_FEES)
      }
    }
  }
  
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {},
  doublecounted: true, // all volume and fees are on Curve DEX
  methodology: {
    Fees: 'Swap fees from TokenExchange events on Yield Basis AMM pools.',
    UserFees: 'Swap fees paid by traders.',
    SupplySideRevenue: 'Swap fees net of the veYB admin-fee share.',
    Revenue: 'veYB admin-fee share of swap fees.',
    HoldersRevenue: 'veYB admin-fee share of swap fees.',
  },
  breakdownMethodology: {
    Fees: { [METRIC.SWAP_FEES]: 'Swap fees from Yield Basis AMM TokenExchange events.' },
    UserFees: { [METRIC.SWAP_FEES]: 'Swap fees from Yield Basis AMM TokenExchange events.' },
    Revenue: { [METRIC.PROTOCOL_FEES]: 'veYB admin-fee share.' },
    HoldersRevenue: { [METRIC.PROTOCOL_FEES]: 'veYB admin-fee share.' },
    SupplySideRevenue: { [METRIC.LP_FEES]: 'Swap fees net of veYB admin-fee share.' },
  },
}

for (const [chain, config] of Object.entries(FactoryConfigs)) {
  (adapter.adapter as any)[chain] = {
    start: config.start,
  }
}

export default adapter
