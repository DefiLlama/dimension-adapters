import { CHAIN } from "../../helpers/chains";

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { processPoolLoans, getLegacyPools } from "./legacyUtils";

// Wrapped M
const WRAPPED_M = '0x437cc33344a0B27A429f795ff6B469C72698B291';
const CLAIMED_EVENT_ABI = 'event Claimed(address indexed account, address indexed recipient, uint240 yield)';

// Staked USDai
const SUSDAI = '0x0B2b2B2076d95dda7817e785989fE353fe955ef9';

// 10,000 basis points = 100%, 10% of interest going to protocol
const BASIS_POINTS_SCALE = 10_000n;
const BASE_YIELD_ADMIN_FEE_RATE = 1_000n;

// Methodology
const methodology = {
  Fees: "Total interest collected from USDai's base token yield and GPU-financing yield",
  Revenue: "Interest going to protocol treasury",
  SupplySideRevenue: "Interest paid to Staked USDai holders"
};

// Fetch function
const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Base yield from base token
  const baseYieldLogs = await options.getLogs({
    target: WRAPPED_M,
    eventAbi: CLAIMED_EVENT_ABI
  });
  baseYieldLogs.filter((log: any) => log.recipient === SUSDAI).forEach((log: any) => {
    dailyFees.add(WRAPPED_M, log.yield);
    dailyRevenue.add(WRAPPED_M, log.yield * BASE_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE);
    dailySupplySideRevenue.add(WRAPPED_M, log.yield * (BASIS_POINTS_SCALE - BASE_YIELD_ADMIN_FEE_RATE) / BASIS_POINTS_SCALE);
  });

  // Legacy pools for GPU-financing
  const pools = getLegacyPools();
  await Promise.all(
    pools.map(pool => processPoolLoans(pool, dailyFees, dailyRevenue, dailySupplySideRevenue, options))
  );

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

// Adapter
const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-05-13',
    }
  },
};

export default adapter;