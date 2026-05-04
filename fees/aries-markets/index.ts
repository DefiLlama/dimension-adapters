import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const rateURL = "https://api-v2.ariesmarkets.xyz/reserve.rateHistory?input=";
const reserveURL = "https://api-v2.ariesmarkets.xyz/reserve.current";
const USDTReserveKey = "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::fa_to_coin_wrapper::WrappedUSDT";
const USDCReserveKey = "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::wrapped_coins::WrappedUSDC";

const STABLE_COIN_DECIMAL = 6;
const DAY_IN_YEARS = 365;

const getRateHistoryURL = (timestamp: number, reserveKey: string) => {
  const input = encodeURIComponent(JSON.stringify({
    fromTs: timestamp,
    resolutionInHours: 24,
    reserveKey,
  }));
  return `${rateURL}${input}`;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const reserves = (await fetchURL(reserveURL)).result.data.stats;

  let df = 0;
  for (const reserveKey of [USDTReserveKey, USDCReserveKey]) {
    const dayFeesQuery = (await fetchURL(getRateHistoryURL(options.startOfDay, reserveKey))).result.data[0];

    const matchingReserve = reserves.find(
      (reserve) => reserve.key === reserveKey
    );
    const borrowApr = Number(dayFeesQuery?.borrowApr);
    const totalBorrowed = Number(matchingReserve?.value?.total_borrowed);

    if (isNaN(borrowApr) || isNaN(totalBorrowed)) {
      throw new Error(`Invalid data for date ${options.dateString}`);
    }

    df +=
      borrowApr *
      totalBorrowed /
      10 ** STABLE_COIN_DECIMAL /
      DAY_IN_YEARS;
  }

  const dpr = df * 0.2;
  const dssr = df * 0.8;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(df, METRIC.BORROW_INTEREST);
  dailyRevenue.addUSDValue(dpr, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(dssr, METRIC.BORROW_INTEREST);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Interest paid by borrowers across all lending markets (USDT and USDC).",
  Revenue: "Portion of borrow interest kept by Aries Markets (20% of total interest).",
  SupplySideRevenue: "Interest distributed to lenders who supply assets (80% of total interest).",
  ProtocolRevenue: "Portion of borrow interest kept by Aries Markets treasury (20% of total interest).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest accrued from borrowers on USDT and USDC reserves, calculated from daily borrow APR and total borrowed amounts',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Aries Markets keeps 20% of all borrow interest as protocol revenue',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: 'Aries Markets keeps 20% of all borrow interest as protocol revenue',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Lenders receive 80% of borrow interest as yield on their supplied assets',
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
