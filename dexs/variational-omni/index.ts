import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchUrl from "../../utils/fetchURL";

const URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

const fetch = async (_: any) => {
  const data = await fetchUrl(URL);

  return {
    // Two factors. The headline open_interest counts each position from both counterparties, so
    // it is exactly 2.0000x the sum of the per-listing long_open_interest + short_open_interest.
    // That sum is then halved again: Variational is an RFQ/dealer venue where long != short
    // (Sigma long $576.5M vs Sigma short $312.0M), so the one-sided figure is the average of the
    // two sides, not either one. Net: a quarter of the published number.
    openInterestAtEnd: Number(data.open_interest) / 4,
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