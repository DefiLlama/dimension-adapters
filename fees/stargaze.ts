/**
 * DefiLlama dimension-adapters — fees/stargaze.ts
 *
 * Stargaze is an NFT marketplace and launchpad that moved from its own chain
 * to the Cosmos Hub on 2026-03-16 and settles in ATOM. There is no public
 * Stargaze API; the figures come from Stargaze Pulse, an open analytics site
 * computed from the indexed chain, whose /api/v1/fees returns per-UTC-day
 * totals of the marketplace's 2% protocol fee on secondary sales, the creator
 * royalties those sales paid, and the platform's 8% mint fee, in uatom
 * (ATOM-denominated legs) and USD. Method and definitions:
 * https://stargaze-pulse.vercel.app/docs/api and https://stargaze-pulse.vercel.app/glossary.
 *
 * Version 1 adapter: the source is an external API returning daily aggregates.
 */
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API = "https://stargaze-pulse.vercel.app/api/v1/fees";
const ATOM_CG_ID = "cosmos";

interface FeesDay {
  date: string;
  marketplaceFeeUatom: number;
  royaltiesUatom: number;
  mintFeeUatom: number;
  marketplaceFeeUsd: number;
  royaltiesUsd: number;
  mintFeeUsd: number;
}

const fetch = async (options: FetchOptions) => {
  const day = options.dateString; // YYYY-MM-DD, UTC
  const res = await fetchURL(`${API}?from=${day}&to=${day}`);
  const row: FeesDay | undefined = res?.data?.days?.find((d: FeesDay) => d.date === day);
  if (!row) throw new Error(`no fee row for ${day}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // ATOM-denominated legs, priced by CoinGecko's ATOM id; the Hub era settles in ATOM.
  dailyFees.addCGToken(ATOM_CG_ID, row.marketplaceFeeUatom / 1e6, "Marketplace fee");
  dailyFees.addCGToken(ATOM_CG_ID, row.royaltiesUatom / 1e6, "Creator royalties");
  dailyFees.addCGToken(ATOM_CG_ID, row.mintFeeUatom / 1e6, "Mint fee");
  dailyRevenue.addCGToken(ATOM_CG_ID, row.marketplaceFeeUatom / 1e6, "Marketplace fee");
  dailyRevenue.addCGToken(ATOM_CG_ID, row.mintFeeUatom / 1e6, "Mint fee");
  dailySupplySideRevenue.addCGToken(ATOM_CG_ID, row.royaltiesUatom / 1e6, "Creator royalties");

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Marketplace protocol fee (2% of every secondary sale) plus creator royalties on those sales plus the platform's mint fee (8% of every mint), per UTC day.",
  Revenue: "The marketplace protocol fee and the mint fee — the parts kept by Stargaze.",
  ProtocolRevenue: "Same as Revenue (marketplace fee + mint fee).",
  SupplySideRevenue: "Creator royalties paid on secondary sales.",
};

const breakdownMethodology = {
  Fees: {
    "Marketplace fee": "2% protocol fee on secondary sales (sales.protocol_amount in the indexed chain).",
    "Creator royalties": "Royalties paid to collection creators on secondary sales.",
    "Mint fee": "8% platform fee on mints (mints.network_fee_amount).",
  },
  Revenue: {
    "Marketplace fee": "2% protocol fee on secondary sales.",
    "Mint fee": "8% platform fee on mints.",
  },
  ProtocolRevenue: {
    "Marketplace fee": "2% protocol fee on secondary sales.",
    "Mint fee": "8% platform fee on mints.",
  },
  SupplySideRevenue: {
    "Creator royalties": "Royalties paid to collection creators on secondary sales.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.COSMOS],
  start: "2026-03-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
