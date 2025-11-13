import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const ABI = {
  market_count: "uint256:market_count",
  fee: "uint256:fee",
  admin_fee: "uint256:admin_fee",
  coins: "function coins(uint256) view returns(address)",
  markets: "function markets(uint256 arg0) view returns ((address asset_token, address cryptopool, address amm, address lt, address price_oracle, address virtual_pool, address staker))",
  TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)',
}

interface IFactory {
  factory: string;
  start: string;
}

interface IPool {
  pool: string;
  feeRate: number;
  adminFeeRate: number;
  coins: Array<string>;
}

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
    const fees: Array<any> = await options.api.multiCall({
      abi: ABI.fee,
      calls: ammAddresses,
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
        feeRate: Number(fees[i]) / 1e18,
        adminFeeRate: admin_fees[i] ? Number(admin_fees[i]) / 1e18 : 0,
      })
    }
    
    const swapLogs: Array<Array<any>> = await options.getLogs({
      targets: pools.map(p => p.pool),
      eventAbi: ABI.TokenExchange,
      flatten: false,
    })
    for (let i = 0; i < pools.length; i++) {
      for (const log of swapLogs[i]) {
        const volume = Number(log.tokens_sold)
        const fee = volume * pools[i].feeRate
        const adminFee = fee * pools[i].adminFeeRate
  
        dailyVolume.add(pools[i].coins[Number(log.sold_id)], volume)
        dailyFees.add(pools[i].coins[Number(log.sold_id)], fee)
        dailyRevenue.add(pools[i].coins[Number(log.sold_id)], adminFee)
      }
    }
  }
  
  const dailySupplySideRevenue = dailyFees.clone(1)
  dailySupplySideRevenue.subtract(dailyRevenue)
  
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {},
  doublecounted: true, // all volume and fees are on Curve DEX
  methodology: {
    Fees: 'Swap fees from users from Curve pools deployed by Yield Basis.',
    SupplySideRevenue: 'Swap fees distributed to depositors on Yield Basis.',
    Revenue: 'Admin fees collected on Curve pools deployed by Yield Basis.',
  },
}

for (const [chain, config] of Object.entries(FactoryConfigs)) {
  (adapter.adapter as any)[chain] = {
    start: config.start,
  }
}

export default adapter
