import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const rateURL = "https://api-v2.ariesmarkets.xyz/reserve.rateHistory?input=";
const reserveURL = "https://api-v2.ariesmarkets.xyz/reserve.current";

const DAY_IN_YEARS = 365;

const getRateHistoryURL = (timestamp: number, reserveKey: string) => {
  const input = encodeURIComponent(JSON.stringify({
    fromTs: timestamp,
    resolutionInHours: 24,
    reserveKey,
  }));
  return `${rateURL}${input}`;
};

const fetch = async (options: FetchOptions) => {
  const reserves = (await fetchURL(reserveURL)).result.data.stats;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Aries lists every borrowable market in reserve.current; charge interest on
  // all of them (the coin type is the reserve key, priced by the framework so
  // each market's own decimals/price are applied).
  for (const reserve of reserves) {
    const reserveKey = reserve.key;
    const totalBorrowed = Number(reserve?.value?.total_borrowed);
    if (!totalBorrowed) continue;

    const rateHistory = (await fetchURL(getRateHistoryURL(options.startOfDay, reserveKey))).result.data[0];
    const borrowApr = Number(rateHistory?.borrowApr);
    if (isNaN(borrowApr)) continue;

    // Each reserve keeps a different cut of borrow interest for the protocol
    // (reserve_ratio, in percent); the rest accrues to lenders. Confirmed
    // against the reserve's supplyApr/borrowApr/utilization.
    const reserveRatio = Number(reserve?.value?.reserve_config?.reserve_ratio) / 100;
    if (isNaN(reserveRatio)) continue;

    const dailyInterest = borrowApr * totalBorrowed / DAY_IN_YEARS;

    dailyFees.add(reserveKey, dailyInterest, METRIC.BORROW_INTEREST);
    dailyRevenue.add(reserveKey, dailyInterest * reserveRatio, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(reserveKey, dailyInterest * (1 - reserveRatio), METRIC.BORROW_INTEREST);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Interest paid by borrowers across all Aries lending markets.",
  Revenue: "Protocol's share of borrow interest, set per market by each reserve's reserve_ratio.",
  SupplySideRevenue: "Interest distributed to lenders who supply assets (the remainder of each market's interest).",
  ProtocolRevenue: "Protocol's share of borrow interest, set per market by each reserve's reserve_ratio.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest accrued from borrowers across all reserves, calculated from each reserve daily borrow APR and total borrowed amount',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: `Protocol's share of borrow interest, set per market by each reserve's reserve_ratio.`,
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: `Protocol's share of borrow interest, set per market by each reserve's reserve_ratio.`,
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: `Interest distributed to lenders who supply assets (the remainder of each market's interest).`,
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.APTOS],
  fetch,
  start: "2025-06-15",
  methodology,
  breakdownMethodology,
};

export default adapter;
