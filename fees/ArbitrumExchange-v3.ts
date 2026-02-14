import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";
import { METRIC } from "../helpers/metrics";

const customLogic = ({ dailyVolume, dailyFees, filteredPairs, fetchOptions }: any) => {
  // Label the fees for breakdown - all fees are swap fees
  const labeledDailyFees = fetchOptions.createBalances();
  labeledDailyFees.addBalances(dailyFees, METRIC.SWAP_FEES);

  // All fees go to ARX token holders, no LP or protocol cut
  const dailyHoldersRevenue = fetchOptions.createBalances();
  dailyHoldersRevenue.addBalances(dailyFees, METRIC.SWAP_FEES);

  return {
    dailyVolume,
    dailyFees: labeledDailyFees,
    dailyUserFees: labeledDailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
  };
};

const fetch = getUniV3LogAdapter({
  factory: '0x855f2c70cf5cb1d56c15ed309a4dfefb88ed909e',
  customLogic,
});

const methodology = {
  UserFees: "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
  ProtocolRevenue: "No protocol revenue.",
  SupplySideRevenue: "LPs have no revenue.",
  HoldersRevenue: "ARX stakers receive all fees."
};

const breakdownMethodology = {
  UserFees: {
    [METRIC.SWAP_FEES]: "Variable swap fees paid by users based on pool configuration, ranging from 0.008% to 1% of trade value"
  },
  Fees: {
    [METRIC.SWAP_FEES]: "Variable swap fees paid by users based on pool configuration, ranging from 0.008% to 1% of trade value"
  },
  HoldersRevenue: {
    [METRIC.SWAP_FEES]: "100% of swap fees are distributed to ARX token stakers; no fees go to liquidity providers or protocol"
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-05-09',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;