import { httpGet } from "../../utils/fetchURL";
import { FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// OroSwap is an AMM DEX on ZIGChain. The pool-manager endpoint exposes a
// per-pool `fees24H` (USD); there is no aggregate fees field, so we sum them.
// The mainnet host is header-gated (403 without a browser UA + Origin), which
// httpGet can satisfy; this is a header check, not a Cloudflare challenge.
const POOLS_URL = "https://api-mainnet.oroswap.org/api/poolmanager/pools?offset=0&limit=1000";
const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Origin: "https://app.oroswap.org",
};

const fetch = async (): Promise<FetchResultV2> => {
  const data = await httpGet(POOLS_URL, { headers: HEADERS });
  const pools = [...(data?.xyk ?? []), ...(data?.custom ?? [])];
  if (!pools.length) throw new Error("OroSwap: no pools returned");

  const dailyFees = pools.reduce((acc: number, pool: any) => {
    const raw = pool?.details?.fees24H;
    // Fail closed on a malformed pool rather than treating it as zero fees.
    if (raw === null || raw === undefined || raw === "") {
      throw new Error(`OroSwap: missing fees24H for pool ${pool?.details?.poolName ?? "?"}`);
    }
    const fees = Number(raw);
    if (!Number.isFinite(fees)) {
      throw new Error(`OroSwap: non-numeric fees24H (${raw}) for pool ${pool?.details?.poolName ?? "?"}`);
    }
    return acc + fees;
  }, 0);

  // Swap fees are paid by the trader; report fees only (raw numbers so no
  // revenue split is required). The protocol-vs-LP share is not exposed.
  return { dailyFees, dailyUserFees: dailyFees };
};

const methodology = {
  Fees: "Sum of the trailing-24h swap fees across OroSwap's pools (per-pool fees24H, USD), from the OroSwap pool-manager API.",
  UserFees: "All swap fees are paid by the traders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ZIGCHAIN]: {
      fetch,
      // The endpoint only exposes a rolling 24h snapshot, so run at current time.
      runAtCurrTime: true,
      start: '2025-09-27', // earliest OroSwap pool
    },
  },
  methodology,
};

export default adapter;
