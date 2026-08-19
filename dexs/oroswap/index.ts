import { httpGet } from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// OroSwap is an AMM DEX on ZIGChain. Its pool-manager endpoint returns a
// server-side aggregate `totalVolume24H` (USD), alongside per-pool figures.
// The mainnet host is header-gated (403 without a browser UA + Origin), which
// httpGet can satisfy; this is a header check, not a Cloudflare challenge.
const POOLS_URL = "https://api-mainnet.oroswap.org/api/poolmanager/pools?offset=0&limit=1000";
const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Origin: "https://app.oroswap.org",
};

const fetch = async () => {
  const data = await httpGet(POOLS_URL, { headers: HEADERS });
  const raw = data?.totalVolume24H;
  // Reject missing/blank before Number(): Number(null) and Number("") are a
  // finite 0, which would silently report zero volume.
  if (raw === null || raw === undefined || raw === "") {
    throw new Error("OroSwap: missing totalVolume24H");
  }
  const dailyVolume = Number(raw);
  if (!Number.isFinite(dailyVolume)) {
    throw new Error(`OroSwap: non-numeric totalVolume24H (${raw})`);
  }
  return { dailyVolume };
};

const methodology = {
  Volume: "Total USD value of swaps across OroSwap's pools over the trailing 24h, taken from the OroSwap pool-manager API's aggregate totalVolume24H.",
};

const adapter: SimpleAdapter = {
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.ZIGCHAIN],
  version: 2,
  methodology,
};

export default adapter;
