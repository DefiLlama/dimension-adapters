import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_URL = "https://api-boolean-sei.capylabs.io/api/v1/defillama/derivatives";

interface DerivativeMetric {
  tokenAddress: string;
  contractId: string;
  symbol: string;
  dailyVolumeRaw: string;
}

interface DerivativeResponse {
  chain: string;
  fromTimestamp: number;
  toTimestamp: number;
  metrics: DerivativeMetric[];
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  const response: DerivativeResponse = await httpGet(
    `${API_URL}?fromTimestamp=${options.startTimestamp}&toTimestamp=${options.endTimestamp}`
  );

  response.metrics.forEach((m) => {
    dailyVolume.add(m.tokenAddress, m.dailyVolumeRaw);
  });

  return { dailyVolume };
};

const methodology = {
  dailyVolume:
    "Sum of opened perpetual position sizes (positionSizeRaw) from POSITION_OPENED events within the requested period, grouped by token.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: "2026-04-03",
    },
  },
  methodology,
};

export default adapter;
