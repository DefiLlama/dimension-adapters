import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/**
 * Tron Services — energy & bandwidth rentals on TRON.
 * Data source (public): https://tron-services.xyz/api/defillama/fees
 *   returns a daily UTC series in TRX: { series: [{ date: "YYYY-MM-DD", fees, revenue, supplySide }] }
 *     - fees       = total paid by clients (full order price)
 *     - revenue    = platform margin (each provider's fee % applied to their sales)
 *     - supplySide = distributed to the energy/bandwidth providers
 * Amounts are TRX; reported as the native token so DefiLlama prices to USD.
 *
 * Destination in the fork of DefiLlama/dimension-adapters:  fees/tron-services.ts
 * Test:  npm test fees tron-services 2026-07-08   (verified passing)
 */
const API = "https://tron-services.xyz/api/defillama/fees";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const data = await fetchURL(API); // fetchURL devuelve el body JSON directo
  const day = (data?.series || []).find((x: any) => x.date === options.dateString);
  if (day) {
    dailyFees.addCGToken("tron", Number(day.fees) || 0, "Energy & bandwidth fees");
    dailyRevenue.addCGToken("tron", Number(day.revenue) || 0, "Platform revenue");
    dailySupplySideRevenue.addCGToken("tron", Number(day.supplySide) || 0, "Provider payouts");
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TRON],
  start: "2026-06-14",
  methodology: {
    Fees: "Total paid by clients for energy and bandwidth rentals (the full order price).",
    Revenue: "Platform margin kept after paying providers — each provider's fee % applied to their own sales.",
    SupplySideRevenue: "Value distributed to the energy/bandwidth providers who fulfilled the orders.",
  },
  breakdownMethodology: {
    Fees: { "Energy & bandwidth fees": "Full price paid by clients for energy and bandwidth rentals." },
    Revenue: { "Platform revenue": "Portion kept by Tron Services (the provider fee %)." },
    SupplySideRevenue: { "Provider payouts": "Portion paid out to the energy/bandwidth providers." },
  },
};

export default adapter;
