import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Source: Rise Trade 24h perps volume endpoint.
// include_bots=false currently returns 429s, so use include_bots=true.
const VOLUME_API = "https://api.rise.trade/v1/stats/volume?include_bots=true";

const fetch = async () => {
  const response = await httpGet(VOLUME_API);
  if (response.data?.total_volume === undefined) {
    throw new Error("RiseX volume data missing");
  }

  const dailyVolume = Number(response.data.total_volume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  runAtCurrTime: true,
  start: "2026-04-01",
  methodology: {
    Volume: "24h perpetual trading volume from Rise Trade's stats API, with bots included.",
  },
};

export default adapter;
