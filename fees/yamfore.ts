import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from "axios";

const fetch: any = async (options: FetchOptions) => {
  const { data } = await axios.get(
    `https://data.yamfore.com/fees-revenue?from=${options.startTimestamp}&to=${options.endTimestamp}`,
  );

  return {
    dailyFees: Number(data.dailyFees) / 1e6,
    dailyRevenue: Number(data.dailyRevenue) / 1e6,
  };
};

export default {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch: fetch,
      start: '2024-10-14',
      methodology:
        "Fees collected from loan creation fees, interest accured is not yet calculated.",
    },
  },
};
