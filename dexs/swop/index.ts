import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://backend.swop.fi/pools"

const methodology = {
  Fees: "A minor fee is collected on each swap, functioning as trading fees.\n" +
      "The fees are set at 0.6% for CPMM pools (with volatile coins) and 0.15% for stablecoin pools. A fee discount of 5-35% is granted to governance token stakers.",
  Revenue: "Revenue is 35% of all collected fees",
  ProtocolRevenue: "10% of all collected fees go to the Team Fund. 21% of fees are spent for the governance token buyout and burning. ",
  HoldersRevenue: "Revenue for stakers is 14% of all collected fees",
  SupplySideRevenue: "LP revenue is 55% of all collected fees"
}
interface IInfo {
  day: IVolume;
  week: IVolume;
};

interface IVolume {
  liquidityFee: string;
  amountTransactions: string;
  governanceFee: string;
  volume: string;
};

interface IAPIResponse {
  overall: IInfo;
};

const fetch = async (timestamp: number) => {
  const response: IAPIResponse = (await fetchURL(URL));
  const fees = (parseFloat(response.overall.day.liquidityFee) + parseFloat(response.overall.day.governanceFee)) // 90% of fees
  const teamRevenue = fees / 90 * 10 // 10% of fees going to team treasure
  return {
    dailyVolume: `${response.overall.day.volume}`,
    dailyFees: `${fees + teamRevenue}`,
    dailyUserFees: `${fees + teamRevenue}`,
    dailyRevenue: `${response.overall.day.governanceFee}`,
    dailyProtocolRevenue: `${teamRevenue}`,
    dailyHoldersRevenue: `${response.overall.day.governanceFee}`,
    dailySupplySideRevenue: `${response.overall.day.liquidityFee}`,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.WAVES]: {
      fetch,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 0,
      meta: {
        methodology
      }
    },
  }
};

export default adapter;
