import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";

// dreamDEX — on-chain spot central limit order book (CLOB) on Somnia.
// Volume is sourced from the dreamDEX indexer API (one summation request per market per window),
// not on-chain logs: the public Somnia RPC caps eth_getLogs at 1000 blocks and the chain's block
// rate makes a per-window log scan impractical. The API returns per-market base-token volume, which
// DefiLlama prices itself (we do not trust the API's own USD figures).
const API = "https://api.dreamdex.io";

// A market whose base is native SOMI reports a codeless sentinel address; value it as the gas token.
const NATIVE_BASE_SENTINEL = "0x28f34defd2b4cb48d9ee6d89f2be4bc601694c00";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  // API window is unix-ms, half-open [since, until) — keyed off the v2 window bounds (seconds),
  // not startOfDay, so hourly pulls query their own window.
  const since = options.startTimestamp * 1000;
  const until = options.endTimestamp * 1000;

  const { markets } = await fetchURL(`${API}/v0/markets`);

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

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOMNIA],
  start: "2026-05-11", // SpotPool mainnet deploy (Foundry broadcast); no volume before this
  methodology: {
    Volume:
      "Spot trading volume on the dreamDEX CLOB on Somnia. For each market the dreamDEX indexer API " +
      "(GET /v0/markets/{symbol}/volume) returns the base-token quantity filled in the requested " +
      "window; each base token (native SOMI, USDC.e, WBTC, WETH) is valued by DefiLlama. On-chain " +
      "getLogs is impractical because the public Somnia RPC caps eth_getLogs at 1000 blocks.",
  },
};

export default adapter;
