import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const ENDPOINT = "https://public.rise.rich/public/defillama/dex-volume";

interface VolumeResponse {
  breakdown: {
    volume_buy: number;
    volume_sell: number;
    volume_borrow: number;
    volume_repay: number;
  };
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = `${ENDPOINT}?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const res: VolumeResponse = await fetchURL(url);

  // DEX dashboard tracks swap-only volume. Borrow/repay are lending operations
  // and excluded here; the lending fee is still surfaced in fees/rise.ts.
  // `volume_buy` already includes 'create' (the first buy of a new market).
  const tradeVolume =
    (res?.breakdown?.volume_buy || 0) + (res?.breakdown?.volume_sell || 0);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(tradeVolume);
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
      "Sum of buy/sell trade notional on rise.rich bonding-curve markets, USD-valued at the collateral price. 'Buy' includes the initial mint ('create') of a new market. Borrow/repay activity is excluded from DEX volume and surfaced via the fees adapter.",
  },
};

export default adapter;
