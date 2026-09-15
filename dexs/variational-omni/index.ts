import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchUrl from "../../utils/fetchURL";

const URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

const fetch = async (_: any) => {
  const data = await fetchUrl(URL);

  return {
    // The headline open_interest is gross both-legs: exactly 2.00000x the sum of the per-listing
    // long_open_interest + short_open_interest (measured on two snapshots). Those per-listing
    // sides are user exposure against the dealer, not the two legs of one contract - Variational
    // is RFQ, and 51 of 550 markets carry longs with short exactly 0, which a two-leg field pair
    // could not - so their sum already counts each position once. Halve once, not twice.
    openInterestAtEnd: Number(data.open_interest) / 2,
    dailyVolume: data?.total_volume_24h ,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  runAtCurrTime: true,
  start: "2025-01-30", //Mainnet Private Beta
};

export default adapter;