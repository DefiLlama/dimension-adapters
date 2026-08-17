import { httpPost } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Dooar (served from the mooar.com trade backend) is a multi-chain AMM DEX,
// tracked on DefiLlama for TVL but absent from /dexs. Its stats endpoint
// returns trailing-24h swap volume in USD keyed by pool address, per chain.
// The API's chain keys ("bsc", "polygon") match the CHAIN enum values, so one
// fetch serves every chain via options.chain.
const VOLUME_URL = "https://trade.mooar.com/dooar/volume";

const fetch = async (options: FetchOptions) => {
  const body = await httpPost(
    VOLUME_URL,
    { chain: options.chain },
    { headers: { "Content-Type": "application/json" }, timeout: 10000 }
  );

  // Fail closed on a malformed response rather than reporting a false zero.
  if (body?.code !== 200 || typeof body?.data !== "object" || body.data === null) {
    throw new Error(`Dooar: unexpected response for ${options.chain}`);
  }

  // body.data is { [poolAddress]: "<usd volume>" }. Sum the per-pool USD
  // volume; an empty object is a legitimate no-trade day, not an error.
  let dailyVolume = 0;
  for (const raw of Object.values(body.data as Record<string, string>)) {
    const poolVolume = Number(raw);
    if (!Number.isFinite(poolVolume)) {
      throw new Error(`Dooar: non-numeric pool volume (${raw}) on ${options.chain}`);
    }
    dailyVolume += poolVolume;
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Sum of the trailing-24h swap volume (USD) across Dooar's pools on each chain, from the Dooar stats API (per-pool volume keyed by pool address).",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.BSC, CHAIN.POLYGON],
  start: '2022-09-23',
  methodology,
};

export default adapter;
