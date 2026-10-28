import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

// Yaka V3 is an Algebra Integral 1.2 fork on Sei.
// Factory: 0xEdbBc263C74865e67C6b16F47740Fa3901b95Ae1
// On-chain defaultCommunityFee = 15 / 1000 = 1.5% (verified across pools).
// The community fee routes to veYAKA holders via the gauge/bribe system.

const GECKOTERMINAL_POOLS_URL =
  "https://api.geckoterminal.com/api/v2/networks/sei-evm/dexes/yaka-finance-v3/pools";
const COMMUNITY_FEE_SHARE = 0.015;
const MAX_PAGES = 20;

const getFeeRateFromPoolName = (name = "") => {
  const feeMatch = name.match(/([0-9.]+)%\s*$/);
  if (!feeMatch) throw new Error(`Yaka V3: could not parse fee tier from pool name "${name}" — GeckoTerminal naming may have changed`);
  return Number(feeMatch[1]) / 100;
};

const fetchPools = async () => {
  const pools: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetchURLAutoHandleRateLimit(`${GECKOTERMINAL_POOLS_URL}?page=${page}`);
    const pagePools = response?.data ?? [];
    if (!pagePools.length) break;
    pools.push(...pagePools);
    await sleep(1000);
  }
  return pools;
};

const fetch = async (_options: FetchOptions) => {
  const pools = await fetchPools();
  let dailyVolume = 0;
  let dailyFees = 0;

  for (const { attributes } of pools) {
    const volume = Number(attributes.volume_usd.h24);
    if (!Number.isFinite(volume) || volume <= 0) continue;
    dailyVolume += volume;
    dailyFees += volume * getFeeRateFromPoolName(attributes.name);
  }

  const dailyRevenue = dailyFees * COMMUNITY_FEE_SHARE;
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue: dailyFees - dailyRevenue,
  };
};

const methodology = {
  Fees: "Swap fees calculated from each pool's 24h volume and advertised fee tier.",
  UserFees: "Swap fees paid by users on each trade.",
  Revenue: "1.5% community fee on swaps.",
  HoldersRevenue: "1.5% community fee routed to veYAKA holders via gauges.",
  SupplySideRevenue: "98.5% of swap fees distributed to liquidity providers.",
};

export default {
  version: 1,
  runAtCurrTime: true,
  methodology,
  fetch,
  chains: [CHAIN.SEI],
};
