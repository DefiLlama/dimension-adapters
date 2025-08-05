import { CallsParams } from "@defillama/sdk/build/types";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";
import { formatAddress } from "../utils/utils";
import { addOneToken } from "./prices";

const FEE_DENOMINATOR = 1e10

export enum ContractVersion {
  main = 'main',
  crypto = 'crypto',
  stable_factory = 'stable_factory',
  factory_crypto = 'factory_crypto',
  factory_crvusd = 'factory_crvusd',
  factory_twocrypto = 'factory_twocrypto',
  factory_tricrypto = 'factory_tricrypto',
  factory_stable_ng = 'factory_stable_ng',
}

export interface ICurveFactory {
  address: string;
  fromBlock: number;
}

export interface ICurveDexConfig {
  start: string;
  stable_factory?: Array<ICurveFactory>;
  factory_crypto?: Array<ICurveFactory>;
  factory_crvusd?: Array<ICurveFactory>;
  factory_twocrypto?: Array<ICurveFactory>;
  factory_tricrypto?: Array<ICurveFactory>;
  factory_stable_ng?: Array<ICurveFactory>;
  customPools: {
    // version => pools
    [key: string]: Array<string>;
  };
}

interface IDexPool {
  pool: string;
  tokens: Array<string>;
  feeRate: number;
  adminFeeRate: number;
}

interface ITokenExchangeEvent {
  pool: string;
  sold_id: number;
  tokens_sold: number;
  bought_id: number;
  tokens_bought: number;
}

const CurveContractAbis: { [key: string]: any } = {
  [ContractVersion.main]: {
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.crypto]: {
    TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.stable_factory]: {
    PlainPoolDeployed: 'event PlainPoolDeployed (address[4] coins, uint256 A, uint256 fee, address deployer)',
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.factory_crypto]: {
    CryptoPoolDeployed: 'event CryptoPoolDeployed(address token, address[2] coins, uint256 A, uint256 gamma, uint256 mid_fee, uint256 out_fee, uint256 allowed_extra_profit, uint256 fee_gamma, uint256 adjustment_step, uint256 admin_fee, uint256 ma_half_time, uint256 initial_price, address deployer)',
    TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.factory_twocrypto]: {
    TwocryptoPoolDeployed: 'event TwocryptoPoolDeployed(address pool, string name, string symbol, address[2] coins, address math, bytes32 salt, uint256[2] precisions, uint256 packed_A_gamma, uint256 packed_fee_params, uint256 packed_rebalancing_params, uint256 packed_prices, address deployer)',
    TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)',
  },
  [ContractVersion.factory_tricrypto]: {
    TricryptoPoolDeployed: 'event TricryptoPoolDeployed(address pool, string name, string symbol, address weth, address[3] coins, address math, bytes32 salt, uint256 packed_precisions, uint256 packed_A_gamma, uint256 packed_fee_params, uint256 packed_rebalancing_params, uint256 packed_prices, address deployer)',
    TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)',
  },
  [ContractVersion.factory_stable_ng]: {
    PlainPoolDeployed: 'event PlainPoolDeployed(address[] coins, uint256 A, uint256 fee, address deployer)',
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
}

async function getPoolTokens(options: FetchOptions, poolAddresses: Array<string>): Promise<{[key: string]: IDexPool}> {
  const pools: {[key: string]: IDexPool} = {}

  const coinsCalls: Array<CallsParams> = []
  for (const poolAddress of poolAddresses) {
    for (let i = 0; i < 5; i++) {
      coinsCalls.push({
        target: poolAddress,
        params: [i],
      })
    }
  }

  const coinsResults = await options.api.multiCall({
    abi: 'function coins(uint256) view returns (address)',
    calls: coinsCalls,
    permitFailure: true,
  })
  const coinsOldResults = await options.api.multiCall({
    abi: 'function coins(int128) view returns (address)',
    calls: coinsCalls,
    permitFailure: true,
  })
  const feeResults = await options.api.multiCall({
    abi: 'function fee() view returns (uint256)',
    calls: poolAddresses,
    permitFailure: true,
  })
  const adminFeeResults = await options.api.multiCall({
    abi: 'function admin_fee() view returns (uint256)',
    calls: poolAddresses,
    permitFailure: true,
  })

  for (let i = 0; i < poolAddresses.length; i++) {
    let tokens = coinsResults.slice(i * 5 , i * 5 + 5).filter(item => item !== null)
    if (tokens.length === 0) {
      tokens = coinsOldResults.slice(i * 5 , i * 5 + 5).filter(item => item !== null)
    }

    pools[poolAddresses[i]] = {
      pool: poolAddresses[i],
      tokens: tokens,
      feeRate: feeResults[i] ? Number(feeResults[i]) / FEE_DENOMINATOR : 0,
      adminFeeRate: adminFeeResults[i] ? Number(adminFeeResults[i]) / FEE_DENOMINATOR : 0,
    }
  }

  return pools;
}

export async function getCurveDexData(options: FetchOptions, config: ICurveDexConfig) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const tokenExchangeEvents: Array<ITokenExchangeEvent> = [];
  const uniquePoolAddresses: {[key: string]: boolean} = {}

  // swap logs - main
  for (const [version, pools] of Object.entries(config.customPools)) {
    const swapLogs = await options.getLogs({
      targets: pools,
      eventAbi: CurveContractAbis[version].TokenExchange,
      flatten: true,
      onlyArgs: false,
    });

    for (const log of swapLogs) {
      uniquePoolAddresses[formatAddress(log.address)] = true
      tokenExchangeEvents.push({
        pool: formatAddress(log.address),
        sold_id: Number(log.args.sold_id),
        tokens_sold: Number(log.args.tokens_sold),
        bought_id: Number(log.args.bought_id),
        tokens_bought: Number(log.args.tokens_bought),
      })
    }
  }

  const pools = await getPoolTokens(options, Object.keys(uniquePoolAddresses))

  for (const event of tokenExchangeEvents) {
    const token0 = pools[event.pool].tokens[event.sold_id]
    const token1 = pools[event.pool].tokens[event.bought_id]
    const feeRate = pools[event.pool].feeRate
    const adminFeeRate = pools[event.pool].adminFeeRate
    const amount0 = Number(event.tokens_sold)
    const amount1 = Number(event.tokens_bought)

    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0, amount1 })
    addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: amount0 * feeRate, amount1: amount1 * feeRate })
    addOneToken({ chain: options.chain, balances: dailyRevenue, token0, token1, amount0: amount0 * feeRate * adminFeeRate, amount1: amount1 * feeRate * adminFeeRate })
  }

  return { dailyVolume, dailyFees, dailyRevenue }
}

export function getCurveExport(configs: {[key: string]: ICurveDexConfig}) {
  const adapter: SimpleAdapter = {
    version: 2,
    adapter: Object.keys(configs).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: async function(options: FetchOptions) {
            return await getCurveDexData(options, configs[chain])
          },
          start: configs[chain].start,
        }
      }
    }, {})
  };

  return adapter;
}
