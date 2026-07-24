import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const cardz_fees_url = "https://app.cardz.game/api/cardz/defifees";

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const result = await fetchURL(
    `${cardz_fees_url}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`
  );

  const fees = Number(result.data?.fees || 0);

  return {
    dailyFees: fees,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SUI],
  start: '2026-01-01',
  methodology: {
    Fees: 'Total fees from Cardz Game card pack sales (on-chain) and marketplace transactions.',
  }
};

export default adapter;