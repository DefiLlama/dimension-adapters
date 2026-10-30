import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// GongFuFeeCollector: the Pons V2 creator-fee recipient for the GF token. It has no owner and no withdraw
// function: it can only claim the creator share of GF trading fees (paid in USDG) from the Pons fee escrow
// and spend that USDG buying GF into the GongFu reward reserve (GongFuPool 0x0557b1f2003aac5ae3bf791eea469259786773d2).
// Verified source: https://robin.etherscan.io/address/0xbfb0cd280a6394901f7d945e41100b50a9e79755#code
const FEE_COLLECTOR = "0xbfb0cd280a6394901f7d945e41100b50a9e79755";
// USDG, the quote asset of the GF/USDG pair; FeesClaimed.amount and ReserveBuyback.usdIn are USDG amounts
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const CREATOR_FEES_TO_BUYBACKS = "Creator Fees To Reserve Buybacks";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // creator fees are recorded when the collector claims them from the Pons escrow (claimFees is permissionless)
  const claims = await options.getLogs({
    target: FEE_COLLECTOR,
    eventAbi: "event FeesClaimed(address indexed caller, uint256 amount)",
  });
  claims.forEach((log: any) => {
    dailyFees.add(USDG, log.amount, METRIC.CREATOR_FEES);
    dailyRevenue.add(USDG, log.amount, CREATOR_FEES_TO_BUYBACKS);
  });

  // USDG spent buying GF into the reward reserve, which pays capped rewards to users who lock GF
  const buybacks = await options.getLogs({
    target: FEE_COLLECTOR,
    eventAbi: "event ReserveBuyback(address indexed caller, uint256 usdIn, uint256 gfOut)",
  });
  buybacks.forEach((log: any) => {
    dailyHoldersRevenue.add(USDG, log.usdIn, METRIC.TOKEN_BUY_BACK);
  });

  return { dailyFees, dailyRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "The creator share of the Pons launchpad trading fee on GF trades, paid in USDG to the GongFu fee collector contract when it claims from the Pons fee escrow.",
  Revenue: "All creator fees received by the GongFu fee collector. The contract has no owner and can only spend them on buying GF for the GongFu reward reserve.",
  HoldersRevenue: "USDG spent by the GongFu fee collector buying GF back into the GongFu reward reserve, which pays capped rewards to users who lock GF.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.CREATOR_FEES]: "Creator share of the Pons trading fee on GF trades, claimed in USDG by the GongFu fee collector.",
  },
  Revenue: {
    [CREATOR_FEES_TO_BUYBACKS]: "Creator fees kept by the GongFu fee collector, which can only use them to buy GF into the reward reserve.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "USDG spent buying GF on the GF/USDG pool and delivering it into the GongFu reward reserve.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-22",
  // these are the creator share of Pons V2 hook fees, already counted (as supply side) in the ponsdotfamily-v2 listing
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
