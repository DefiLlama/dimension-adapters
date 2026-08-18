import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const FACTORY = "0x3dD8Fd033f7A3231e38a54ce6d710d5E5F074745";
const POOL_CREATED = "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
const FACTORY_FROM_BLOCK = 76234791

// Same swap-fee split as Dooar v2:
// 30% LPs, 60% ecosystem (buybacks/burns/events), 10% development
// https://whitepaper.stepn.com/other-modules/decentralized-exchange
const LP_SHARE = 0.3;
const ECOSYSTEM_SHARE = 0.6;
const DEV_SHARE = 0.1;

const LABEL = {
  SWAP_FEES: "Token Swap Fees",
  LP_FEES: "Swap Fees To Liquidity Providers",
  PROTOCOL_FEES: "Swap Fees To Protocol",
  ECOSYSTEM_FEES: "Swap Fees To Ecosystem",
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
    revenueRatio: ECOSYSTEM_SHARE + DEV_SHARE,
    protocolRevenueRatio: DEV_SHARE,
    holdersRevenueRatio: ECOSYSTEM_SHARE,
  })(options);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.add(results.dailyFees, LABEL.SWAP_FEES);
  dailySupplySideRevenue.add(results.dailyFees.clone(LP_SHARE), LABEL.LP_FEES);
  dailyProtocolRevenue.add(results.dailyFees.clone(DEV_SHARE), LABEL.PROTOCOL_FEES);
  dailyHoldersRevenue.add(results.dailyFees.clone(ECOSYSTEM_SHARE), LABEL.ECOSYSTEM_FEES);
  dailyRevenue.add(results.dailyFees.clone(DEV_SHARE), LABEL.PROTOCOL_FEES);
  dailyRevenue.add(results.dailyFees.clone(ECOSYSTEM_SHARE), LABEL.ECOSYSTEM_FEES);

  return {
    dailyVolume: results.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailyRevenue,
  };
};

const methodology = {
  Volume: "Swap volume from UniV3 Swap events on Dooar V3 pools.",
  Fees: "Users pay the pool fee tier on each swap.",
  UserFees: "Users pay the pool fee tier on each swap.",
  SupplySideRevenue: "30% of swap fees are paid to liquidity providers.",
  Revenue: "70% of swap fees: 60% to the STEPN ecosystem and 10% to development.",
  HoldersRevenue: "60% of swap fees are held for ecosystem use (GMT buybacks, NFT burns, events).",
  ProtocolRevenue: "10% of swap fees funds future development.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SWAP_FEES]: "Pool-tier swap fee paid by traders.",
  },
  UserFees: {
    [LABEL.SWAP_FEES]: "Pool-tier swap fee paid by traders.",
  },
  SupplySideRevenue: {
    [LABEL.LP_FEES]: "30% of swap fees paid to liquidity providers.",
  },
  Revenue: {
    [LABEL.PROTOCOL_FEES]: "10% of swap fees funds future development.",
    [LABEL.ECOSYSTEM_FEES]: "60% of swap fees held for ecosystem use (GMT buybacks, NFT burns, events).",
  },
  ProtocolRevenue: {
    [LABEL.PROTOCOL_FEES]: "10% of swap fees funds future development.",
  },
  HoldersRevenue: {
    [LABEL.ECOSYSTEM_FEES]: "60% of swap fees held for ecosystem use (GMT buybacks, NFT burns, events).",
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
};

export default adapter;
