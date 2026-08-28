import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const FACTORY = "0x3dD8Fd033f7A3231e38a54ce6d710d5E5F074745";
const POOL_CREATED = "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
const FACTORY_FROM_BLOCK = 76234791

// Same 1% swap-fee split as Dooar v2 (30% LPs / 60% ecosystem / 10% development),
// but the ecosystem share mixes GMT buybacks, NFT burns, and events, so the
// revenue / supply-side / holders attribution is not clear enough to report.
// https://whitepaper.stepn.com/other-modules/decentralized-exchange
const LABEL = {
  SWAP_FEES: "Token Swap Fees",
};

const fetch = async (options: FetchOptions) => {
  const poolLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: POOL_CREATED,
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  });
  const pools = poolLogs.map((log: any) => log.pool).filter(Boolean);

  const results = await getUniV3LogAdapter({
    pools,
    userFeesRatio: 1,
  })(options);

  const dailyFees = options.createBalances();
  dailyFees.add(results.dailyFees, LABEL.SWAP_FEES);

  return {
    dailyVolume: results.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Volume: "Swap volume from UniV3 Swap events on Dooar V3 pools.",
  Fees: "Users pay the pool fee tier on each swap. The whitepaper splits fees across LPs, ecosystem (buybacks/burns/events), and development, but the exact attribution is not reported.",
  UserFees: "Users pay the pool fee tier on each swap.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SWAP_FEES]: "Pool-tier swap fee paid by traders.",
  },
  UserFees: {
    [LABEL.SWAP_FEES]: "Pool-tier swap fee paid by traders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.POLYGON],
  start: "2025-09-09",
  methodology,
  breakdownMethodology,
  skipBreakdownValidation: true, // ecosystem share mixes buybacks, burns, and events; no clean revenue / LP / holders split
};

export default adapter;
