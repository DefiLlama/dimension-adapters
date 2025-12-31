import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/*
  PotatoSwap does not have a reliable public subgraph.
  We use the official API endpoint instead:

  https://v3.potatoswap.finance/api/pool/list-all

  The API returns rolling 24h metrics per pool.
  We aggregate ONLY v2 pools.

  Docs reference:
  "A portion of all trading fees is used to reward our Liquidity Providers,
   with the remainder supporting the PotatoSwap ecosystem."
*/

const API_URL = "https://v3.potatoswap.finance/api/pool/list-all";

const fetch = async (_t: number) => {
  const response = await fetchURL(API_URL);

  // ✅ THIS IS THE CRITICAL FIX
  const pools = response?.data ?? [];

  let dailyVolume = 0;
  let dailyFees = 0;

  for (const pool of pools) {
    if (pool.protocol_version !== "v2") continue;

    dailyVolume += Number(pool.volume_24h_usd || 0);
    dailyFees += Number(pool.fee_24h_usd || 0);
  }

  // Fee split derived from docs:
  // Total fee: 0.25%
  // LPs:       0.21%
  // Protocol:  0.04%
  const lpShare = dailyFees * (0.21 / 0.25);
  const protocolShare = dailyFees * (0.04 / 0.25);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: lpShare,
    dailyProtocolRevenue: protocolShare,
    dailyHoldersRevenue: protocolShare,
    dailyRevenue: protocolShare,
  };
};

const methodology = {
  Fees: "PotatoSwap charges a 0.25% swap fee on v2 pools.",
  UserFees: "Users pay a 0.25% swap fee per trade.",
  SupplySideRevenue:
    "Liquidity providers receive ~0.21% of swap volume as fees.",
  ProtocolRevenue:
    "The remaining ~0.04% of swap volume supports the PotatoSwap ecosystem.",
  HoldersRevenue:
    "Protocol revenue is distributed to vePOT holders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch,
      start: "2024-04-23",
    },
  },
  methodology,
};

export default adapter;
