import { cache } from "@defillama/sdk";
import { ethers } from "ethers";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const FACTORY = '0xAA2cd7477c451E703f3B9Ba5663334914763edF8';
// Voter contract for this factory's gauge ecosystem, from the (now dead)
// subgraph's own manifest - maps pools to gauges, and gauges to fee
// distributors (where external bribes get deposited).
const VOTER = '0xAAA2564DEb34763E3d05162ed3f5C2658691f499';

const poolCreatedAbi = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
const bribeAbi = 'event Bribe(address indexed from, address indexed reward, uint256 amount, uint256 period)';

const VOTER_ABI = {
  gauges: "function gauges(address) view returns (address)",
  customGaugeForPool: "function customGaugeForPool(address) view returns (address)",
  feeDistributers: "function feeDistributers(address) view returns (address)",
}

// Split matches the one documented in the old fees/ramses-exchange-v2 adapter:
// https://docs.ramses.exchange/ramses-cl-v2/concentrated-liquidity/fee-distribution
const baseFetch = getUniV3LogAdapter({
  factory: FACTORY,
  revenueRatio: 0.8,
  protocolRevenueRatio: 0.08,
  holdersRevenueRatio: 0.72,
});


async function getBribes(options: FetchOptions) {
  const { api, getLogs, createBalances } = options;

  // Same pool-log cache getUniV3LogAdapter itself reads from - avoids a
  // redundant on-chain PoolCreated scan. Cached logs are raw (undecoded),
  // same as getUniV3LogAdapter itself decodes them before use.
  const cacheKey = `tvl-adapter-cache/cache/logs/${options.chain}/${FACTORY.toLowerCase()}.json`;
  const { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true });
  const iface = new ethers.Interface([poolCreatedAbi]);
  const pools: string[] = logs
    .map((log: any) => iface.parseLog(log)?.args?.pool)
    .filter((pool: any) => !!pool);

  const bribes = createBalances();
  if (!pools.length) return bribes;

  const [gauges, customGauges] = await Promise.all([
    api.multiCall({ abi: VOTER_ABI.gauges, target: VOTER, calls: pools, permitFailure: true }),
    api.multiCall({ abi: VOTER_ABI.customGaugeForPool, target: VOTER, calls: pools, permitFailure: true }),
  ]);

  const allGauges = [...new Set([...gauges, ...customGauges].filter((g: string) => g && g.toLowerCase() !== ADDRESSES.null))];
  if (!allGauges.length) return bribes;

  const feeDistributors = await api.multiCall({ abi: VOTER_ABI.feeDistributers, target: VOTER, calls: allGauges, permitFailure: true });
  const validFeeDistributors = [...new Set(feeDistributors.filter((f: string) => f && f.toLowerCase() !== ADDRESSES.null))];
  if (!validFeeDistributors.length) return bribes;

  const bribeLogs = await getLogs({ targets: validFeeDistributors, eventAbi: bribeAbi, flatten: true });
  bribeLogs.forEach((log: any) => {
    bribes.add(log.reward, log.amount, 'Bribes');
  });
  return bribes;
}

const fetch = async (options: FetchOptions) => {
  const result = await baseFetch(options);
  const bribes = await getBribes(options);
  const bribeUSD = Number(await bribes.getUSDValue());

  result.dailyHoldersRevenue.addUSDValue(bribeUSD, 'Bribes to holders');

  return result;
};

const methodology = {
  Volume: "Sum of traded volume across all pools created by the CL factory.",
  Fees: "Swap fees paid by users on each trade.",
  Revenue: "80% of swap fees, split between the protocol treasury and token holders.",
  SupplySideRevenue: "20% of swap fees, distributed to LPs.",
  ProtocolRevenue: "8% of swap fees, allocated to the protocol treasury.",
  HoldersRevenue: "72% of swap fees, plus all bribes (off-statement tokenholder income), allocated to token holders.",
}

const breakdownMethodology = {
  Fees: {
    'Token Swap Fees': "Swap fees paid by users on each trade.",
  },
  Revenue: {
    'Protocol fees': "80% of swap fees, split between the protocol treasury and token holders.",
  },
  SupplySideRevenue: {
    'LP fees': "20% of swap fees, distributed to LPs.",
  },
  ProtocolRevenue: {
    'Protocol fees': "8% of swap fees, allocated to the protocol treasury.",
  },
  HoldersRevenue: {
    'Tokenholder fees': "72% of swap fees, allocated to token holders.",
    'Bribes to holders': "External bribes paid to influence gauge votes, paid out entirely to token holders who vote (off-statement tokenholder income).",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2023-05-31',
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
