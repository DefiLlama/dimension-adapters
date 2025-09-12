import { CHAIN } from "../helpers/chains";
import { cache } from "@defillama/sdk";
import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { ethers } from "ethers";
import { filterPools } from '../helpers/uniswap';
import { addOneToken } from "../helpers/prices";
import { queryDune } from "../helpers/dune";
import axios from "axios";

const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

interface Ifactory {
  address: string;
  start: string;
  blacklistTokens?: Array<string>;
}

const factories: {[key: string]: Ifactory} = {
  [CHAIN.BSC]: {
    start: '2023-04-01',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    blacklistTokens: [
      '0xc71b5f631354be6853efe9c3ab6b9590f8302e81',
      '0xe6df05ce8c8301223373cf5b969afcb1498c5528',
      '0xa0c56a8c0692bd10b3fa8f8ba79cf5332b7107f9',
      '0xb4357054c3da8d46ed642383f03139ac7f090343',
      '0x6bdcce4a559076e37755a78ce0c06214e59e4444',
      '0x87d00066cf131ff54b72b134a217d5401e5392b6',
      '0x30c60b20c25b2810ca524810467a0c342294fc61',
      '0xd82544bf0dfe8385ef8fa34d67e6e4940cc63e16',
      '0x595e21b20e78674f8a64c1566a20b2b316bc3511',
      '0x783c3f003f172c6ac5ac700218a357d2d66ee2a2',
      '0xb9e1fd5a02d3a33b25a14d661414e6ed6954a721',
      '0x95034f653D5D161890836Ad2B6b8cc49D14e029a',
      '0xFf7d6A96ae471BbCD7713aF9CB1fEeB16cf56B41',
    ]
  },
  [CHAIN.ETHEREUM]: {
    start: '2023-04-01',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.POLYGON_ZKEVM]: {
    start: '2023-06-08',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  },
  [CHAIN.ERA]: {
    start: '2023-07-24',
    address: '0x1bb72e0cbbea93c08f535fc7856e0338d7f7a8ab',
  },
  [CHAIN.ARBITRUM]: {
    start: '2023-08-08',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.LINEA]: {
    start: '2023-08-24',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.BASE]: {
    start: '2023-08-21',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.OP_BNB]: {
    start: '2023-08-31',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  },
}

export const PANCAKESWAP_V3_QUERY = (fromTime: number, toTime: number, blacklistTokens: Array<string>) => {
  return `
    SELECT
        project_contract_address AS pool
        , SUM(
          CASE 
              WHEN token_sold_address NOT IN (${blacklistTokens.toString()})
              AND token_bought_address NOT IN (${blacklistTokens.toString()})
              THEN amount_usd
              ELSE 0 
          END
        ) AS clean_volume_usd
        , SUM(amount_usd) AS total_volume_usd 
    FROM dex.trades
    WHERE blockchain = 'bnb'
      AND project = 'pancakeswap'
      AND version = '3'
      AND block_time >= FROM_UNIXTIME(${fromTime})
      AND block_time <= FROM_UNIXTIME(${toTime})
    GROUP BY
      project_contract_address
  `;
}

// Source: https://docs.pancakeswap.finance/trade/trading-faq/swap-faq#what-will-be-the-trading-fee-breakdown-for-v3-exchange
function getProtocolRevenueRatio(fee: number): number {
  if (fee === 0.0001) return 0.18; // 18% swap fee
  if (fee === 0.0005) return 0.19; // 19% swap fee
  if (fee === 0.0025) return 0.09; // 9% swap fee
  if (fee === 0.01) return 0.09; // 9% swap fee
  return 0;
}

function getHolderRevenueRatio(fee: number): number {
  if (fee === 0.0001) return 0.15; // 15% swap fee
  if (fee === 0.0005) return 0.15; // 15% swap fee
  if (fee === 0.0025) return 0.23; // 23% swap fee
  if (fee === 0.01) return 0.23; // 23% swap fee
  return 0;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const factory = String(factories[options.chain].address).toLowerCase()
  
  if (!options.chain) throw new Error('Wrong version?')
  
  const cacheKey = `tvl-adapter-cache/cache/logs/${options.chain}/${factory}.json`
  const iface = new ethers.Interface([poolCreatedEvent])
  let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!logs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
  logs = logs.map((log: any) => iface.parseLog(log)?.args)

  const pairObject: IJSON<string[]> = {}
  const fees: any = {}
  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1]
    fees[log.pool] = (log.fee?.toString() || 0) / 1e6
  })

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  if (options.chain === CHAIN.BSC) {
    const poolsAndVolumes = await queryDune('3996608',{
      fullQuery: PANCAKESWAP_V3_QUERY(options.fromTimestamp, options.toTimestamp, factories[options.chain].blacklistTokens as Array<string>),
    });

    const poolFees = await options.api.multiCall({
      abi: 'uint256:fee',
      calls: poolsAndVolumes.map((item: any) => item.pool)
    })
    for (let i = 0; i < poolsAndVolumes.length; i++) {
      if (poolsAndVolumes[i].clean_volume_usd !== null && poolsAndVolumes[i].total_volume_usd !== null) {
        // add clean volume, exclude blacklist token
        dailyVolume.addUSDValue(poolsAndVolumes[i].clean_volume_usd)

        const fee = poolFees[i] ? Number(poolFees[i] / 1e6) : 0
        const protocolRevenueRatio = getProtocolRevenueRatio(fee);
        const holdersRevenueRatio = getHolderRevenueRatio(fee);
        const revenueRatio = protocolRevenueRatio + holdersRevenueRatio;
        const supplySideRevenueRatio = 1 - revenueRatio;

        // add fees from total volume, including blacklist tokens
        dailyFees.addUSDValue(Number(poolsAndVolumes[i].total_volume_usd) * fee)
        dailyRevenue.addUSDValue(Number(poolsAndVolumes[i].total_volume_usd) * fee * revenueRatio)
        dailyProtocolRevenue.addUSDValue(Number(poolsAndVolumes[i].total_volume_usd) * fee * protocolRevenueRatio)
        dailyHoldersRevenue.addUSDValue(Number(poolsAndVolumes[i].total_volume_usd) * fee * holdersRevenueRatio)
        dailySupplySideRevenue.addUSDValue(Number(poolsAndVolumes[i].total_volume_usd) * fee * supplySideRevenueRatio)
      }
    }
  } else {
    const filteredPairs = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances })
    const allLogs = await options.getLogs({ targets: Object.keys(filteredPairs), eventAbi: poolSwapEvent, flatten: false })
    allLogs.map((logs: any, index) => {
      if (!logs.length) return;
      const pair = Object.keys(filteredPairs)[index]
      const [token0, token1] = pairObject[pair]
      const fee = fees[pair]
      logs.forEach((log: any) => {
        const protocolRevenueRatio = getProtocolRevenueRatio(fee);
        const holdersRevenueRatio = getHolderRevenueRatio(fee);
        const revenueRatio = protocolRevenueRatio + holdersRevenueRatio;
        const supplySideRevenueRatio = 1 - revenueRatio;
  
        const amount0 = Number(log.amount0)
        const amount1 = Number(log.amount1)
  
        addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0, amount1 })
        addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: amount0 * fee, amount1: amount1 * fee })
        addOneToken({ chain: options.chain, balances: dailyRevenue, token0, token1, amount0: amount0 * fee * revenueRatio, amount1: amount1 * fee * revenueRatio })
        addOneToken({ chain: options.chain, balances: dailyProtocolRevenue, token0, token1, amount0: amount0 * fee * protocolRevenueRatio, amount1: amount1 * fee * protocolRevenueRatio })
        addOneToken({ chain: options.chain, balances: dailyHoldersRevenue, token0, token1, amount0: amount0 * fee * holdersRevenueRatio, amount1: amount1 * fee * holdersRevenueRatio })
        addOneToken({ chain: options.chain, balances: dailySupplySideRevenue, token0, token1, amount0: amount0 * fee * supplySideRevenueRatio, amount1: amount1 * fee * supplySideRevenueRatio })
      })
    })
  }
  
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
}

const pancakeSolanaExplorer = 'https://sol-explorer.pancakeswap.com/api/cached/v1/pools/info/list?poolType=concentrated&poolSortField=default&order=desc'
const blacklistPools = [
  'EbkGwrT4zf7Hczrn23zyoPJHThd2NHguJnyWiJe9wf9D',
];

const fetchSolanaV3 = async (_a: any, _b: any, _: FetchOptions) => {
  let dailyVolume = 0;
  let dailyFees = 0;
  let dailyProtocolRevenue = 0;
  let dailyHoldersRevenue = 0;
  let dailySupplySideRevenue = 0;

  let page = 1;
  let allPools: Array<any> = [];
  do {
    const response = await axios.get(`${pancakeSolanaExplorer}&pageSize=100&page=${page}`);
    const pools = response.data.data;
    if (pools.length == 0) {
      break;
    }
    allPools = allPools.concat(pools);

    page += 1;
  } while(true)

  for (const pool of allPools.filter(pool => !blacklistPools.includes(pool.id))) {
    dailyVolume += Number(pool.day.volume);
    dailyFees += Number(pool.day.volumeFee);

    const feeRate = pool.feeRate ? Number(pool.feeRate) : 0
    const protocolRevenueRatio = getProtocolRevenueRatio(feeRate);
    const holdersRevenueRatio = getHolderRevenueRatio(feeRate);
    const revenueRatio = protocolRevenueRatio + holdersRevenueRatio;
    const supplySideRevenueRatio = 1 - revenueRatio;

    dailyProtocolRevenue += Number(pool.day.volumeFee) * protocolRevenueRatio
    dailyHoldersRevenue += Number(pool.day.volumeFee) * holdersRevenueRatio
    dailySupplySideRevenue += Number(pool.day.volumeFee) * supplySideRevenueRatio
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue + dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
  UserFees: "All trading fees paid by users",
  Revenue: "Pancakeswap collects amount of swap fees for Treasury and buy back CAKE.",
  SupplySideRevenue: "Fees distributed to LPs",
  ProtocolRevenue: "Swap fees collected by Pancakeswap - distribute to Treasury",
  HoldersRevenue: "Swap fees collected by Pancakeswap used for buyback and burn CAKE",
}

const adapter: SimpleAdapter = {
  version: 1,
  isExpensiveAdapter: true,
  methodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolanaV3,
      runAtCurrTime: true,
    }
  },
};

for (const [chain, config] of Object.entries(factories)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: fetch,
    start: config.start,
  }
}

export default adapter;
