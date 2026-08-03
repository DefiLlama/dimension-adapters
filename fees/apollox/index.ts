import { Adapter, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const FeesAndRevenueURL = "https://www.apollox.finance/bapi/futures/v1/public/future/apx/fee/all"
const ASTER_BUYBACK_START_DATE = '2026-06-17';
const ASTER_BUYBACK_SHARE = 0.99;

const fetch = async (options: FetchOptions) => {

  const { data: { alpFeeVOFor24Hour } } = await fetchURL(FeesAndRevenueURL)
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(alpFeeVOFor24Hour.fee, METRIC.TRADING_FEES);
  const dailyHoldersRevenue = options.dateString < ASTER_BUYBACK_START_DATE
    ? options.createBalances()
    : dailyFees.clone(ASTER_BUYBACK_SHARE, METRIC.TOKEN_BUY_BACK);

  return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
  };
}

const methodology = {
  Fees: "All trading fees collected from perpetual futures trading, including opening/closing positions and funding fees.",
  Revenue: "From Jun 17, 2026, 99% of Aster perp trading fees is used to buy back ASTER via TWAP and distribute it to veASTER stakers. The undocumented remaining 1% is not attributed.",
  HoldersRevenue: "From Jun 17, 2026, 99% of Aster perp trading fees is used to buy back ASTER via TWAP and distribute it to veASTER stakers. No holder allocation is backfilled before the policy start date.",
  ProtocolRevenue: "No protocol revenue is reported; the undocumented remaining 1% is left unattributed."
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users on perpetual futures contracts, including position open/close fees and funding rate fees"
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "99% of Aster perpetual trading fees from Jun 17, 2026 onward, used to buy back ASTER via TWAP for veASTER stakers"
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "99% of Aster perpetual trading fees from Jun 17, 2026 onward, used to buy back ASTER via TWAP for veASTER stakers"
  }
}

const adapter: Adapter = {
  version: 1,
  fetch,
  start: '2023-07-17',
  chains: [CHAIN.OFF_CHAIN],
  runAtCurrTime: true,
  methodology,
  breakdownMethodology
}

export default adapter;
