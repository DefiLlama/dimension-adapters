import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// ADA units (not lovelace). Trading volume on MuesliSwap protocols (v1, v2, CLP).
// https://aggregator-analytics-v2.muesliswap.com/docs — get_protocol_volume
// days=5000 reaches the 2021-11-28 launch; the default window is only 30 days.
const historicalVolumeEndpoint = "https://aggregator-analytics-v2.muesliswap.com/muesli-protocol-volume?interval=day&days=5000";

const fetch = async (options: FetchOptions) => {
  const vols: Record<string, number> = await httpGet(historicalVolumeEndpoint);
  const volume = vols[String(options.startOfDay)];

  if (volume == null || !Number.isFinite(volume)) {
    const times = Object.keys(vols).map(Number).filter(Number.isFinite);
    const latest = Math.max(...times);
    const earliest = Math.min(...times);
    // Days with no trades are omitted. A gap inside the published range is a real zero.
    // A day outside that range is unpublished or before the source starts, so fail the run.
    if (times.length && options.startOfDay > earliest && options.startOfDay < latest)
      return { dailyVolume: 0 };
    throw new Error(`MuesliSwap volume missing for ${options.startOfDay}`);
  }

  const dailyVolume = options.createBalances();
  // Human ADA. addGasToken expects lovelace (6 decimals) and would undercount by 1e6.
  dailyVolume.addCGToken("cardano", volume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CARDANO],
  start: "2021-11-28",
  // [CHAIN.MILKOMEDA]: {  // milkomeda chain is dead
  //   fetch: async (options: FetchOptions) => getUniV2LogAdapter({ factory: '0x57A8C24B2B0707478f91D3233A264eD77149D408'})(options)
  // },
  methodology: {
    Volume: "Spot trading volume on MuesliSwap protocols (order book, AMM, and concentrated liquidity), counted in ADA.",
  },
};

export default adapter;
