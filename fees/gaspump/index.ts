import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";


const endpoint = "https://api.gas111.com/api/v1/internal/tokens/volume-stats?"


const fetch = async (options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split(".")[0]
  const endTime = new Date(options.endTimestamp * 1000).toISOString().split(".")[0]
  const res = await fetchURL(`${endpoint}start_date=${startTime}&end_date=${endTime}`)

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("the-open-network", parseInt(res.fee_ton));

  return { dailyFees };
};


const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2024-08-31',
    },
  },
  methodology: {
    Fees: "Tokens trading and launching fees paid by users.",
  }
};

export default adapter;
