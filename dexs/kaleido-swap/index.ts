import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const FACTORY = "0xbB74f2319494461B2591F8fbF126654Dd4c2a649";
const FACTORY_FROM_BLOCK = 21_128_631;
;
const POOL_CREATED = "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";

// slot0().feeProtocol = 0 on live pools (0x8a02…42Ca, 0x542E…164a, checked 2026-10-02) => 100% of swap fees to LPs.
const fetch = async (options: FetchOptions) => {
  const poolLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: POOL_CREATED,
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  });
  const pools = poolLogs.map((log: any) => log.pool).filter(Boolean);
  if (!pools.length) throw new Error("Kaleido Swap: no pools discovered from factory");

  return getUniV3LogAdapter({
    pools,
    userFeesRatio: 1,
    revenueRatio: 0,
    protocolRevenueRatio: 0,
  })(options);
};

const methodology = {
  Volume: "Swap volume from all Kaleido Swap V3 pools created by the Kaleido factory on Arc.",
  Fees: "Users pay each pool's fee tier on every swap.",
  UserFees: "Users pay each pool's fee tier on every swap.",
  Revenue: "No protocol fee is taken (feeProtocol is 0 on every pool); all swap fees go to liquidity providers.",
  ProtocolRevenue: "No protocol fee is taken.",
  SupplySideRevenue: "All swap fees go to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    "Token Swap Fees": "Users pay each pool's fee tier on every swap.",
  },
  UserFees: {
    "Trading fees": "Users pay each pool's fee tier on every swap.",
  },
  Revenue: {
    "Protocol fees": "No protocol fee is taken.",
  },
  ProtocolRevenue: {
    "Protocol fees": "No protocol fee is taken.",
  },
  SupplySideRevenue: {
    "LP fees": "All swap fees go to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
