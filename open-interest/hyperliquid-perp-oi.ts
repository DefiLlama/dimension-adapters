import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { LLAMA_HL_INDEXER_META_SNAPSHOTS_FROM_TIME, queryHyperliquidIndexerOpenInterest } from "../helpers/hyperliquid";
import { httpGet } from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  if (options.startOfDay >= LLAMA_HL_INDEXER_META_SNAPSHOTS_FROM_TIME) {
    const result = await queryHyperliquidIndexerOpenInterest(options);
    return {
      openInterestAtEnd: result.totalOpenInterest,
    }
  } else {
    let openInterestAtEnd = 0;
    const full_date_string = new Date(options.startOfDay * 1000).toISOString().split('.000Z')[0];

    const oi_data = await httpGet('https://d2v1fiwobg9w6.cloudfront.net/open_interest');

    for (const item of oi_data.chart_data) {
      if (item.time === full_date_string) {
        // same double-sided convention as the API, halved to stay continuous with the indexer branch
        openInterestAtEnd += item.open_interest / 2;
      }
    }

    return {
      openInterestAtEnd,
    }
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2023-06-12',
};

export default adapter;
