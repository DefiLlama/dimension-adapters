import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const dimensionsEndpoint = "https://chainflip-broker.io/defillama/dexs"

const fetch = async (timestamp: number) => {
  const dimensionsData = await httpGet(`${dimensionsEndpoint}?timestamp=${timestamp}`, { headers: {"x-client-id": "defillama"}});

  return {
    timestamp: dimensionsData.timestamp,
    dailyVolume: dimensionsData.dailyVolume, 
    totalVolume: dimensionsData.totalVolume
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CHAINFLIP]: {
      fetch,
      start: '2023-11-23', // FLIP went live on 2023-11-23 12:00 UTC
      runAtCurrTime: true,
      meta: {
        methodology: {
          Volume: "Deposit value of a swap.",
        }
      }
    },
  },
};

export default adapter;
