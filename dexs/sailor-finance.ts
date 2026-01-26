import { FetchOptions } from '../adapters/types';
import { getConfig } from '../helpers/cache';
import { CHAIN } from '../helpers/chains';
import { addOneToken } from '../helpers/prices';
import { filterPools2 } from '../helpers/uniswap';
import { httpGet } from '../utils/fetchURL';

const endpoint = "https://asia-southeast1-ktx-finance-2.cloudfunctions.net/sailor_poolapi/getPoolList";

const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

const fetch = async (options: FetchOptions) => {
  const { poolStats } = await getConfig('sailor-v3/sei', endpoint)
  const filterObject: any = {
    fetchOptions: options,
    pairs: [],
    token0s: [],
    token1s: [],
  }

  poolStats.forEach((pool: any) => {
    filterObject.pairs.push(pool.id)
    filterObject.token0s.push(pool.token0.id)
    filterObject.token1s.push(pool.token1.id)
  })

  const { pairs } = await filterPools2(filterObject)
  const filteredPoolStats = poolStats.filter((pool: any) => pairs.includes(pool.id))

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const logs = await options.getLogs({
    eventAbi: poolSwapEvent,
    targets: filteredPoolStats.map((item: any) => item.id),
    flatten: false,
  })

  for (let i = 0; i < filteredPoolStats.length; i++) {
    const feeRate = Number(filteredPoolStats[i].feeTier) / 1e6
    for (const log of logs[i]) {
      addOneToken({ chain: options.chain, balances: dailyVolume, token0: filteredPoolStats[i].token0.id, token1: filteredPoolStats[i].token1.id, amount0: Math.abs(Number(log.amount0)), amount1: Math.abs(Number(log.amount1)) })
      addOneToken({ chain: options.chain, balances: dailyFees, token0: filteredPoolStats[i].token0.id, token1: filteredPoolStats[i].token1.id, amount0: Math.abs(Number(log.amount0)) * feeRate, amount1: Math.abs(Number(log.amount1)) * feeRate })
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees.clone(0.16),
    dailyHoldersRevenue: 0,
    dailyProtocolRevenue: dailyFees.clone(0.16),
    dailySupplySideRevenue: dailyFees.clone(0.84),
  }
};

const methodology = {
  Fees: "Sailor-Finance protocol swap fee (0.3% per swap).",
  UserFees: "Sailor-Finance protocol swap fee (0.3% per swap).",
  Revenue: "Fees distributed to the LP providers (84% of total accumulated fees).",
  ProtocolRevenue: "Fees sent to the protocol wallet (16% of total accumulated fees), is used to provide benefits to users in custom ways.",
  SupplySideRevenue: "There are 84% swap fees distributed to LPs.",
};

const blacklistPools: Array<string> = [
  // '0x80fe558c54f1f43263e08f0e1fa3e02d8b897f93',
  // '0x038aac60e1d17ce2229812eca8ee7800214baffc',
  // '0x44b13cd80a9a165a4cea7b6a42952a9a14bd8ff5',
  // '0x9ca64194ce1f88d11535915dc482ae0383d5f76d',
  '0xad00786c2ba76f08c92e7847456015728f98ac56', // bad pool - very low liquidity
];

const fetchV1 = async (_a: any, _b: any, _: FetchOptions) => {
  const { poolStats } = await httpGet('https://asia-southeast1-ktx-finance-2.cloudfunctions.net/sailor_poolapi/getPoolList');
  
  let dailyVolume = 0;
  let dailyFees = 0;
  for (const pool of poolStats.filter((i: any) => Number(i.tvl) > 200)) {
    const volumeToTvl = pool.tvl>0?pool.day.volume/pool.tvl:0;
    if (volumeToTvl<10 && !blacklistPools.includes(String(pool.id).toLowerCase())) {
      dailyVolume += Number(pool.day.volume);
      dailyFees += Number(pool.day.volume) * Number(pool.feeTier) / 1e6;
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees * 0.16,
    dailyProtocolRevenue: dailyFees * 0.16,
    dailySupplySideRevenue: dailyFees * 0.84,
    dailyHoldersRevenue: 0,
  }
}

export default {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.SEI]: {
      fetch: fetchV1,
      runAtCurrTime: true,
    }
  },
}
