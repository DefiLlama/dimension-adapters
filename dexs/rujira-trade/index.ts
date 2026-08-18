import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchRujiraDailyVolumeUsd, RUJIRA_START_DATE } from "../../helpers/rujira";

const FIN_TRADE_VOLUME = "Rujira FIN Trade Volume";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const volumeUsd = await fetchRujiraDailyVolumeUsd(options.startOfDay);

  dailyVolume.addUSDValue(volumeUsd, FIN_TRADE_VOLUME);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.THORCHAIN],
  start: RUJIRA_START_DATE,
  doublecounted: true,
  fetch,
  methodology: {
    Volume: "USD value of all Rujira FIN fills, including user orders, virtualized swaps, XYK, and CCL-originated fills. Virtualized fills may overlap with THORChain DEX volume.",
  },
  breakdownMethodology: {
    Volume: {
      [FIN_TRADE_VOLUME]: "Sum of each FIN pair's app-layer USD volume for the requested UTC day.",
    },
  },
};

export default adapter;
