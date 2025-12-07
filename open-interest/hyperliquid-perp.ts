import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryHyperliquidIndexer } from "../helpers/hyperliquid";
import { httpGet } from "../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const currentDay = Math.floor(Date.now() / 1000 / 86400) * 86400;

  if (options.endTimestamp < currentDay) {
    let openInterestAtEnd = 0;
    const full_date_string = new Date(options.startOfDay * 1000).toISOString().split('.000Z')[0];

    const oi_data = await httpGet('https://d2v1fiwobg9w6.cloudfront.net/open_interest');

    for (const item of oi_data.chart_data) {
      if (item.time === full_date_string) {
        openInterestAtEnd += item.open_interest;
      }
    }

    return {
      openInterestAtEnd,
    }
  } else {
    const result = await queryHyperliquidIndexer(options);

    return {
      openInterestAtEnd: result.currentPerpOpenInterest,
    }
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2023-06-12',
};

export default adapter;
