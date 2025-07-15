import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const rateURL = "https://api-v2.ariesmarkets.xyz/reserve.rateHistory?input=";
const reserveURL = "https://api-v2.ariesmarkets.xyz/reserve.current";
const USDTReserveKey = "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::fa_to_coin_wrapper::WrappedUSDT";
const USDCReserveKey = "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::wrapped_coins::WrappedUSDC";

const STABLE_COIN_DECIMAL = 6;
const DAY_IN_YEARS = 365;

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const reserves = (await fetchURL(reserveURL)).result.data.stats;

  let dailyFees = 0;
  for (const reserveKey of [USDTReserveKey, USDCReserveKey]) {
    const dayFeesQuery = (await fetchURL(`${rateURL}{%22fromTs%22:${timestamp},%22resolutionInHours%22:24,%22reserveKey%22:%22${reserveKey}%22}`
    )).result.data[0];

    const matchingReserve = reserves.find(
      (reserve) => reserve.key === reserveKey
    );

    dailyFees +=
      dayFeesQuery?.borrowApr *
      (matchingReserve?.value.total_borrowed /
        10 ** STABLE_COIN_DECIMAL /
        DAY_IN_YEARS || 0);
  }

  const dailyProtocolRevenue = dailyFees * 0.2;
  const dailySupplySideRevenue = dailyFees * 0.8;

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2025-06-15",
      meta: {
        methodology: {
          Fees: "Interest earned by the protocol.",
          Revenue: "Amount of fees go to Aries Markets treasury.",
          SupplySideRevenue: "Amount of fees distributed to suppliers.",
          ProtocolRevenue: "Amount of fees go to Aries Markets treasury.",
        },
      },
    },
  },
};

export default adapter;
