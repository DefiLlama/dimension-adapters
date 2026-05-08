import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const ENDPOINT = "https://public.rise.rich/public/defillama/dex-volume";

interface VolumeResponse {
  totalVolumeUsd: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = `${ENDPOINT}?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const res: VolumeResponse = await fetchURL(url);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(Number(res?.totalVolumeUsd) || 0);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-04-02",
    },
  },
  methodology: {
    Volume:
      "Buy/sell/create trade notional plus borrow and repay amounts on rise.rich bonding-curve markets, USD-valued at the collateral price.",
  },
};

export default adapter;
