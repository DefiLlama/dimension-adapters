import { uniV2Exports } from "../../helpers/uniswap";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const SWAP_FEE = 0.018;
const LP_SHARE = 30 / 180;
const CREATOR_SHARE = 50 / 180;
const BID_WALL_SHARE = 50 / 180;
const FROTH_BURN_SHARE = 50 / 180;

const customLogic = async ({ dailyVolume, dailyFees, fetchOptions }: any) => {
  const { createBalances } = fetchOptions;
  const dailySupplySideRevenue = createBalances();

  dailySupplySideRevenue.add(dailyFees.clone(LP_SHARE), METRIC.LP_FEES);
  dailySupplySideRevenue.add(dailyFees.clone(CREATOR_SHARE), "Creator Royalty");
  dailySupplySideRevenue.add(dailyFees.clone(BID_WALL_SHARE), "Bid Wall Buy & Burn");

  return {
    dailyVolume,
    dailyFees: dailyFees.clone(1, METRIC.SWAP_FEES),
    dailyUserFees: dailyFees.clone(1, METRIC.SWAP_FEES),
    dailyRevenue: dailyFees.clone(FROTH_BURN_SHARE, "FROTH Burn"),
    dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyFees.clone(FROTH_BURN_SHARE, "FROTH Burn"),
  };
};

const methodology = {
  Volume: "Volume is calculated from Swap events on FrothSwap pairs.",
  Fees: "Each swap charges a 1.80% fee: 0.30% to liquidity providers, 0.50% creator royalty, 0.50% bid wall buy & burn, and 0.50% FROTH burn.",
  UserFees: "Users pay a 1.80% fee on each swap.",
  Revenue: "0.50% of swap fees are used to buy back and burn FROTH.",
  ProtocolRevenue: "No swap fees are allocated to protocol treasury.",
  HoldersRevenue: "0.50% of swap fees are used to buy back and burn FROTH.",
  SupplySideRevenue: "0.30% goes to liquidity providers, 0.50% to token creators as royalty, and 0.50% to bid wall buy & burn.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1.80% swap fee charged on each trade.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "1.80% swap fee charged on each trade.",
  },
  Revenue: {
    "FROTH Burn": "0.50% of swap fees used to buy back and burn FROTH.",
  },
  HoldersRevenue: {
    "FROTH Burn": "0.50% of swap fees used to buy back and burn FROTH.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "0.30% of swap fees distributed to liquidity providers.",
    "Creator Royalty": "0.50% of swap fees paid to token creators.",
    "Bid Wall Buy & Burn": "0.50% of swap fees used for bid wall buy & burn.",
  },
};

export default {
  ...uniV2Exports({
    [CHAIN.ROBINHOOD]: {
      factory: "0x2B1b1FB977e1CD5f18F45571C64E373b1A73dD7f",
      fees: SWAP_FEE,
      customLogic,
      start: "2026-07-11",
    },
  }),
  methodology,
  breakdownMethodology,
};
