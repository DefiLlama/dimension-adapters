import { cache } from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { filterPools } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";

const FACTORY = "0x1d25AF2b0992bf227b350860Ea80Bad47382CAf6";
const POOL_CREATED_EVENT = "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
const SWAP_EVENT = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const protocolFeePools: Array<{ revenueRatio: number; pools: string[] }> = [
  {
    revenueRatio: 0.25,
    pools: [
      "0x2294650d0fA0Cdd9CfB9cF9fFADE6C23C68740D7", // USX/USDC 0.05%
      "0x2F4c290ac9C7B8617857239C46048f81395215Da", // USDC/EURC 0.05%
    ],
  },
  {
    revenueRatio: 0.1,
    pools: [
      "0x71A1aD616680836DBf4248FA8a5F6A60A3937F89", // WETH/USDT 0.30%
      "0x7574Bc9BaC08F22df6B1542B9A85686e825D58D5", // WETH/USDT 0.05%
      "0x0edA2b3C3BC5E6DDeF352beFA4Fc9C9Ca7e7D022", // ETHFI/WETH 0.30%
      "0x85b605af90cAd4890e674CFcAAff6a9f7825fA2d", // USDC/SCR 0.30%
    ],
  },
  {
    revenueRatio: 1 / 6,
    pools: [
      "0x04566Bf83399E4F750728d1ef57008AedDA00E71", // USDC/WETH 0.05%
      "0x3eBF5717d34c363dFB29e14466B33DeAc8dda5E3", // USDC/WETH 0.30%
      "0xF8DF1399B91DD48f0b7DCAbDBed08473c285aF7e", // weETH/WETH 0.05%
    ],
  },
];

const poolRevenueRatio: Record<string, number> = {};
for (const config of protocolFeePools) {
  for (const pool of config.pools) poolRevenueRatio[pool.toLowerCase()] = config.revenueRatio;
}

const fetch = async (options: FetchOptions) => {
  const { api, chain, getLogs, createBalances } = options;

  const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${FACTORY.toLowerCase()}.json`;
  const iface = new ethers.Interface([POOL_CREATED_EVENT]);
  const { logs: rawPoolLogs } = await cache.readCache(cacheKey, { readFromR2Cache: true });

  const pairObject: Record<string, string[]> = {};
  const poolFee: Record<string, number> = {};
  for (const raw of rawPoolLogs) {
    const args = iface.parseLog(raw)?.args;
    if (!args) continue;
    pairObject[args.pool] = [args.token0, args.token1];
    poolFee[args.pool] = Number(args.fee?.toString() || 0) / 1e6;
  }

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances });
  const pairs = Object.keys(filteredPairs);

  const dailyVolume = createBalances();
  const rawFees = createBalances();
  const rawRevenue = createBalances();

  if (pairs.length) {
    const allLogs = await getLogs({ targets: pairs, eventAbi: SWAP_EVENT, flatten: false });
    allLogs.forEach((logs: any[], i: number) => {
      if (!logs.length) return;
      const pair = pairs[i];
      const [token0, token1] = pairObject[pair];
      const fee = poolFee[pair];
      const ratio = poolRevenueRatio[pair.toLowerCase()];
      logs.forEach((log: any) => {
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });
        const amount0Fee = Number(log.amount0.toString()) * fee;
        const amount1Fee = Number(log.amount1.toString()) * fee;
        addOneToken({ chain, balances: rawFees, token0, token1, amount0: amount0Fee, amount1: amount1Fee });
        if (ratio) {
          addOneToken({ chain, balances: rawRevenue, token0, token1, amount0: amount0Fee * ratio, amount1: amount1Fee * ratio });
        }
      });
    });
  }

  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  dailyFees.addBalances(rawFees, "Swap Fees");
  dailyUserFees.addBalances(rawFees, "Swap Fees");
  dailyRevenue.addBalances(rawRevenue, "Swap Fees To Protocol");
  dailySupplySideRevenue.addBalances(rawFees, "Swap Fees To LPs");
  dailySupplySideRevenue.subtract(rawRevenue, "Swap Fees To LPs");

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SCROLL],
  start: "2025-03-25",
  methodology: {
    Fees: "Swap fees paid by users.",
    UserFees: "Swap fees paid by users.",
    Revenue: "Only listed protocol-fee pools share a portion of swap fees with the protocol. All other pools send 100% of swap fees to LPs.",
    ProtocolRevenue: "Protocol revenue is the configured protocol share of swap fees for the listed pools.",
    SupplySideRevenue: "LP revenue is total swap fees minus the protocol share from listed protocol-fee pools.",
  },
  breakdownMethodology: {
    Fees: {
      "Swap Fees": "Swap fees paid by users.",
    },
    UserFees: {
      "Swap Fees": "Swap fees paid by users.",
    },
    Revenue: {
      "Swap Fees To Protocol": "Protocol share of swap fees from the listed protocol-fee pools.",
    },
    ProtocolRevenue: {
      "Swap Fees To Protocol": "Protocol share of swap fees from the listed protocol-fee pools.",
    },
    SupplySideRevenue: {
      "Swap Fees To LPs": "Swap fees distributed to liquidity providers after protocol-fee splits.",
    },
  },
};

export default adapter;
