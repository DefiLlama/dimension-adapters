import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchHIP3DeployerData, LLAMA_HL_INDEXER_FROM_TIME, queryHyperliquidIndexer } from "../helpers/hyperliquid";
import { httpGet } from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  // const todayStartUTC = Math.floor(Date.now() / 1000 / 86400) * 86400;

  if (options.startOfDay >= LLAMA_HL_INDEXER_FROM_TIME) {
    const result = await queryHyperliquidIndexer(options);
    
    // TODO: temp fix for now, will update hl indexer
    let totalOpenInterest = result.currentPerpOpenInterest ? result.currentPerpOpenInterest : 0;
    for (const dexId of ['xyz', 'vntl', 'flx', 'km', 'hyna', 'cash']) {
      const dexResult = await fetchHIP3DeployerData({ options, hip3DeployerId: dexId });
      totalOpenInterest += dexResult.currentPerpOpenInterest ? dexResult.currentPerpOpenInterest : 0;
    }

    return {
      openInterestAtEnd: totalOpenInterest,
    }
  } else {
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
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2023-06-12',
};

export default adapter;
