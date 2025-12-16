import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const summaryEndpoint = "https://pro.edgex.exchange/api/v1/public/quote/getTicketSummary?period=LAST_DAY_1";

const fetch = async (_a: any, _b: any, _c: any): Promise<FetchResultVolume> => {
  const previousDayTradeSummary = await fetchURL(summaryEndpoint);

  const openInterestAtEnd = previousDayTradeSummary.data.tickerSummary.openInterest;
  const dailyVolume = previousDayTradeSummary.data.tickerSummary.value;

  return {
    dailyVolume,
    openInterestAtEnd
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.EDGEX]: {
      fetch,
      start: '2024-08-06',
      runAtCurrTime: true,
    },
  },
};

export default adapter;
