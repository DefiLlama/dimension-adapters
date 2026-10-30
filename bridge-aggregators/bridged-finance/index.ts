import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API_BASE = "https://bridged.finance/api/stats/volume";

const fetch = async (options: FetchOptions) => {
  const { dateString, chain } = options;
  const res = await fetchURL(`${API_BASE}?day=${dateString}&chain=${chain}`);
  const dailyBridgeVolume = res.dailyBridgeVolume ?? res.volume;
  if (dailyBridgeVolume === undefined || dailyBridgeVolume === null) {
    throw new Error(`Failed to retrieve volume for ${chain} on ${dateString}`);
  }
  return {
    dailyBridgeVolume: Number(dailyBridgeVolume),
  };
};

const adapter: SimpleAdapter = {
  version: 1, // endpoint aggregates by UTC day
  fetch,
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.ARBITRUM,
    CHAIN.BASE,
    CHAIN.BSC,
    CHAIN.POLYGON,
    CHAIN.OPTIMISM,
    CHAIN.AVAX,
    CHAIN.SOLANA,
    CHAIN.LINEA,
    CHAIN.SCROLL,
  ],
  start: "2026-01-01",
  doublecounted: true,
  methodology: {
    Volume:
      "USD value of cross-chain swaps and bridge transfers initiated through Bridged Finance interface across supported networks, verified and indexed on-chain.",
  },
};

export default adapter;
