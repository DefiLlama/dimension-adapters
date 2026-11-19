import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { getConfig } from "../../helpers/cache";
import PromisePool from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";
import { USDSO, getTokyoQuoteVolume } from "../../helpers/dreamdex";

// dreamDEX — on-chain spot central limit order book (CLOB) on Somnia and Somnia Tokyo.
// Volume is sourced from the dreamDEX indexers, not on-chain logs: the public Somnia RPC caps eth_getLogs
// at 1000 blocks and the chain's block rate makes a per-window log scan impractical.
// This listing is spot only; perps on Somnia Tokyo are the separate dreamdex-perps listing.
const API = "https://api.dreamdex.io";

// A market whose base is native SOMI reports a codeless sentinel address; value it as the gas token.
const NATIVE_BASE_SENTINEL = "0x28f34defd2b4cb48d9ee6d89f2be4bc601694c00";

// Somnia mainnet: one summation request per market per window. The API returns per-market base-token volume,
// which DefiLlama prices itself (we do not trust the API's own USD figures).
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  // API window is unix-ms, half-open [since, until) — keyed off the v2 window bounds (seconds),
  // not startOfDay, so hourly pulls query their own window.
  const since = options.startTimestamp * 1000;
  const until = options.endTimestamp * 1000;

  const { markets } = await getConfig('dreamdex/markets', `${API}/v0/markets`);

  await PromisePool.withConcurrency(5)
    .for(markets)
    .process(async (market: any) => {
      const { baseVolumeRaw } = await fetchURLAutoHandleRateLimit(
        `${API}/v0/markets/${market.symbol}/volume?since=${since}&until=${until}`
      );
      if (market.base.toLowerCase() === NATIVE_BASE_SENTINEL) {
        dailyVolume.addGasToken(baseVolumeRaw); // native SOMI base
      } else {
        dailyVolume.add(market.base, baseVolumeRaw); // ERC20 base (USDC.e / WBTC / WETH)
      }
      await sleep(500);
    });

  return { dailyVolume };
};

// Somnia Tokyo: every spot market is quoted in USDso, so the quote side of the hourly candles is summed and priced as USDso.
const fetchTokyo = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  dailyVolume.add(USDSO, await getTokyoQuoteVolume(options, "SPOT"));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SOMNIA]: {
      fetch,
      start: "2026-05-11", // SpotPool mainnet deploy (Foundry broadcast); no volume before this
    },
    [CHAIN.SOMNIA_TOKYO]: {
      fetch: fetchTokyo,
      start: "2026-11-06", // first spot fill on Tokyo
    },
  },
  methodology: {
    Volume:
      "Spot trading volume on the dreamDEX CLOB. On Somnia, for each market the dreamDEX indexer API " +
      "(GET /v0/markets/{symbol}/volume) returns the base-token quantity filled in the requested " +
      "window; each base token (native SOMI, USDC.e, WBTC, WETH) is valued by DefiLlama. On Somnia Tokyo, " +
      "the USDso quote volume of every spot market is summed from the dreamDEX indexer's hourly candles and " +
      "valued at the USDso price. On-chain getLogs is impractical because the public Somnia RPC caps " +
      "eth_getLogs at 1000 blocks.",
  },
};

export default adapter;
