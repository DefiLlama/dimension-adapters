import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/*
  PotatoSwap does not have a reliable public subgraph.
  We use the official API endpoint instead:

  https://v3.potatoswap.finance/api/pool/list-all

  The API returns rolling 24h metrics per pool.
  We aggregate ONLY v2 pools.

  Fee split follows the same ratios used in the previous adapter version.
*/

const API_URL = "https://v3.potatoswap.finance/api/pool/list-all";

const fetch = async (_t: number) => {
  const response = await fetchURL(API_URL);

  // API response shape: { code, msg, data }
  const pools = response?.data ?? [];

  let dailyVolume = 0;
  let dailyFees = 0;

  for (const pool of pools) {
    if (pool.protocol_version !== "v2") continue;

    dailyVolume += Number(pool.volume_24h_usd || 0);
    dailyFees += Number(pool.fee_24h_usd || 0);
  }

  /*
    Fee split (same as previous adapter):

    Total fee: 0.25%
    LPs:       0.17%
    Holders:   0.08%
    Protocol:  0%
  */
  const supplySideRevenue = dailyFees * (0.17 / 0.25);
  const holdersRevenue = dailyFees * (0.08 / 0.25);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: supplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: holdersRevenue,
    dailyRevenue: holdersRevenue,
  };
};

const methodology = {
  Fees: "PotatoSwap charges a 0.25% swap fee on v2 pools.",
  UserFees: "Users pay a 0.25% swap fee per trade.",
  SupplySideRevenue:
    "Liquidity providers receive 0.17% of swap volume.",
  HoldersRevenue:
    "0.08% of swap volume is distributed to vePOT holders.",
  ProtocolRevenue:
    "The protocol does not retain a direct fee share.",
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
