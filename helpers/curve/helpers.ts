import { FetchOptions } from "../../adapters/types";

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

export interface IDexPool {
  pool: string;
  tokens: Array<string>;
  feeRate: number;
  adminFeeRate: number;
}

export interface ITokenExchangeEvent {
  pool: string;
  sold_id: number;
  tokens_sold: number;
  bought_id: number;
  tokens_bought: number;
}

export const CurveContractAbis: { [key: string]: any } = {
  [ContractVersion.main]: {
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.crypto]: {
    TokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)',
  },
  [ContractVersion.stable_factory]: {
    pool_count: 'uint256:pool_count',
    pool_list: 'function pool_list(uint256) view returns (address)',
    MetaPoolDeployed: 'event MetaPoolDeployed (address coin, address base_pool, uint256 A, uint256 fee, address deployer)',
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
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
    customPools.stable_factory = customPools.stable_factory.concat(await getVersionPools(options, ContractVersion.stable_factory, config.stable_factory.map(item => item.address)));
  }
  if (config.factory_crypto) {
    customPools.factory_crypto = customPools.factory_crypto ? customPools.factory_crypto : []
    customPools.factory_crypto = customPools.factory_crypto.concat(await getVersionPools(options, ContractVersion.factory_crypto, config.factory_crypto.map(item => item.address)));
  }
  if (config.factory_crvusd) {
    customPools.factory_crvusd = customPools.factory_crvusd ? customPools.factory_crvusd : []
    customPools.factory_crvusd = customPools.factory_crvusd.concat(await getVersionPools(options, ContractVersion.factory_crvusd, config.factory_crvusd.map(item => item.address)));
  }
  if (config.factory_twocrypto) {
    customPools.factory_twocrypto = customPools.factory_twocrypto ? customPools.factory_twocrypto : []
    customPools.factory_twocrypto = customPools.factory_twocrypto.concat(await getVersionPools(options, ContractVersion.factory_twocrypto, config.factory_twocrypto.map(item => item.address)));
  }
  if (config.factory_tricrypto) {
    customPools.factory_tricrypto = customPools.factory_tricrypto ? customPools.factory_tricrypto : []
    customPools.factory_tricrypto = customPools.factory_tricrypto.concat(await getVersionPools(options, ContractVersion.factory_tricrypto, config.factory_tricrypto.map(item => item.address)));
  }
  if (config.factory_stable_ng) {
    customPools.factory_stable_ng = customPools.factory_stable_ng ? customPools.factory_stable_ng : []
    customPools.factory_stable_ng = customPools.factory_stable_ng.concat(await getVersionPools(options, ContractVersion.factory_stable_ng, config.factory_stable_ng.map(item => item.address)));
  }

  return customPools;
}
