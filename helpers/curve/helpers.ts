import { CallsParams } from "@defillama/sdk/build/types";
import { FetchOptions } from "../../adapters/types";
import { formatAddress } from "../../utils/utils";

const FEE_DENOMINATOR = 1e10
const MAX_TOKENS_COUNT = 10

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

export interface ICurveDexConfig {
  start: string;
  stable_factory?: Array<string>;
  factory_crypto?: Array<string>;
  factory_crvusd?: Array<string>;
  factory_twocrypto?: Array<string>;
  factory_tricrypto?: Array<string>;
  factory_stable_ng?: Array<string>;
  customPools: {
    // version => pools
    [key: string]: Array<string>;
  };
  metaBasePools?: {
    [key: string]: {
      tokens: Array<string>;
    }
  }
}

export interface IDexPool {
  pool: string;
  tokens: Array<string>;
  underlyingTokens: Array<string>;
  feeRate: number;
  adminFeeRate: number;
}

export interface ITokenExchangeEvent {
  pool: string;
  tx: string;
  sold_id: number;
  tokens_sold: number;
  bought_id: number;
  tokens_bought: number;
}

export const CurveContractAbis: { [key: string]: any } = {
  [ContractVersion.main]: {
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
    TokenExchangeUnderlying: 'event TokenExchangeUnderlying(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.crypto]: {
    TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.stable_factory]: {
    pool_count: 'uint256:pool_count',
    pool_list: 'function pool_list(uint256) view returns (address)',
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
    TokenExchangeUnderlying: 'event TokenExchangeUnderlying(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.factory_crypto]: {
    pool_count: 'uint256:pool_count',
    pool_list: 'function pool_list(uint256) view returns (address)',
    TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.factory_twocrypto]: {
    pool_count: 'uint256:pool_count',
    pool_list: 'function pool_list(uint256) view returns (address)',
    TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)',
  },
  [ContractVersion.factory_tricrypto]: {
    pool_count: 'uint256:pool_count',
    pool_list: 'function pool_list(uint256) view returns (address)',
    TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)',
  },
  [ContractVersion.factory_stable_ng]: {
    pool_count: 'uint256:pool_count',
    pool_list: 'function pool_list(uint256) view returns (address)',
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.factory_crvusd]: {
    pool_count: 'uint256:pool_count',
    pool_list: 'function pool_list(uint256) view returns (address)',
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
}

async function getVersionPools(options: FetchOptions, version: ContractVersion, factories: Array<string>): Promise<Array<string>> {
  let allPoos: Array<string> = []

  for (const factory of factories) {
    const pool_count = await options.api.call({
      target: factory,
      abi: CurveContractAbis[version].pool_count,
    });
    const pool_list_calls = []
    for (let i = 0; i < Number(pool_count); i++) {
      pool_list_calls.push({
        target: factory,
        params: [i],
      })
    }
    const pool_list = await options.api.multiCall({
      target: factory,
      abi: CurveContractAbis[version].pool_list,
      calls: pool_list_calls,
    });

    allPoos = allPoos.concat(pool_list);
  }

  return allPoos;
}

export async function getAllPools(options: FetchOptions, config: ICurveDexConfig): Promise<{[key: string]: Array<string>}> {
  const customPools: {[key: string]: Array<string>} = config.customPools ? config.customPools : {}

  if (config.stable_factory) {
    customPools.stable_factory = customPools.stable_factory ? customPools.stable_factory : []
    customPools.stable_factory = customPools.stable_factory.concat(await getVersionPools(options, ContractVersion.stable_factory, config.stable_factory));
  }
  if (config.factory_crypto) {
    customPools.factory_crypto = customPools.factory_crypto ? customPools.factory_crypto : []
    customPools.factory_crypto = customPools.factory_crypto.concat(await getVersionPools(options, ContractVersion.factory_crypto, config.factory_crypto));
  }
  if (config.factory_crvusd) {
    customPools.factory_crvusd = customPools.factory_crvusd ? customPools.factory_crvusd : []
    customPools.factory_crvusd = customPools.factory_crvusd.concat(await getVersionPools(options, ContractVersion.factory_crvusd, config.factory_crvusd));
  }
  if (config.factory_twocrypto) {
    customPools.factory_twocrypto = customPools.factory_twocrypto ? customPools.factory_twocrypto : []
    customPools.factory_twocrypto = customPools.factory_twocrypto.concat(await getVersionPools(options, ContractVersion.factory_twocrypto, config.factory_twocrypto));
  }
  if (config.factory_tricrypto) {
    customPools.factory_tricrypto = customPools.factory_tricrypto ? customPools.factory_tricrypto : []
    customPools.factory_tricrypto = customPools.factory_tricrypto.concat(await getVersionPools(options, ContractVersion.factory_tricrypto, config.factory_tricrypto));
  }
  if (config.factory_stable_ng) {
    customPools.factory_stable_ng = customPools.factory_stable_ng ? customPools.factory_stable_ng : []
    customPools.factory_stable_ng = customPools.factory_stable_ng.concat(await getVersionPools(options, ContractVersion.factory_stable_ng, config.factory_stable_ng));
  }

  return customPools;
}

export async function getPoolTokens(options: FetchOptions, poolAddresses: Array<string>, config: ICurveDexConfig): Promise<{[key: string]: IDexPool}> {
  const pools: {[key: string]: IDexPool} = {}

  const coinsCalls: Array<CallsParams> = []
  for (const poolAddress of poolAddresses) {
    for (let i = 0; i < MAX_TOKENS_COUNT; i++) {
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
  const underlyingCoinsResults = await options.api.multiCall({
    abi: 'function underlying_coins(uint256) view returns (address)',
    calls: coinsCalls,
    permitFailure: true,
  })
  const underlyingCoinsOldResults = await options.api.multiCall({
    abi: 'function underlying_coins(int128) view returns (address)',
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
    // coins
    let tokens = coinsResults.slice(i * MAX_TOKENS_COUNT , i * MAX_TOKENS_COUNT + MAX_TOKENS_COUNT).filter(item => item !== null)
    if (tokens.length === 0) {
      tokens = coinsOldResults.slice(i * MAX_TOKENS_COUNT, i * MAX_TOKENS_COUNT + MAX_TOKENS_COUNT).filter(item => item !== null)
    }

    // get underlying coins
    let underlyingTokens: Array<string> = underlyingCoinsResults.slice(i * MAX_TOKENS_COUNT , i * MAX_TOKENS_COUNT + MAX_TOKENS_COUNT).filter(item => item !== null)
    if (underlyingTokens.length === 0) {
      underlyingTokens = underlyingCoinsOldResults.slice(i * MAX_TOKENS_COUNT , i * MAX_TOKENS_COUNT + MAX_TOKENS_COUNT).filter(item => item !== null)
    }

    // unwrap metapool underlying tokens
    if (underlyingTokens.length === 0 && config.metaBasePools) {
      for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
        const lpTokenAddress = formatAddress(tokens[tokenIndex])
        if (config.metaBasePools[lpTokenAddress]) {
          underlyingTokens = underlyingTokens.concat(config.metaBasePools[lpTokenAddress].tokens)
        } else {
          underlyingTokens.push(lpTokenAddress)
        }
      }
    }

    pools[poolAddresses[i]] = {
      pool: poolAddresses[i],
      tokens: tokens,
      underlyingTokens: underlyingTokens,
      feeRate: feeResults[i] ? Number(feeResults[i]) / FEE_DENOMINATOR : 0,
      adminFeeRate: adminFeeResults[i] ? Number(adminFeeResults[i]) / FEE_DENOMINATOR : 0,
    }
  }

  return pools;
}
