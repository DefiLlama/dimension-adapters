import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";
const plimit = require("p-limit");
const limit = plimit(1);

/**
 * Tron Services — energy & bandwidth rental marketplace on TRON.
 *
 * Fully on-chain: we read the platform wallet's TRX transfers from Tronscan.
 *   incoming TRX   = fees paid by clients for energy & bandwidth rentals
 *   outgoing TRX   = payouts distributed to the providers (supply side)
 *   incoming - out = protocol revenue (the platform margin kept)
 *
 * Providers are paid once per day at market close (00:00 UTC) from this same
 * wallet, so daily fees are exact and the revenue / supply-side split is exact
 * on a cumulative basis. On a single day the payout can exceed that day's fees
 * (it settles the previous day), which is why revenue can be negative for a day
 * — allowNegativeValue keeps the income-statement identity fees = revenue + supply.
 */

// Public platform wallet — deposit + payouts hot wallet. Verifiable on Tronscan:
// https://tronscan.org/#/address/TEU6avyp6qTHy4JjuetZi9eAPT4VSmD19b
const WALLET = "TEU6avyp6qTHy4JjuetZi9eAPT4VSmD19b";
// Tronscan public transfers endpoint (same data source TronSave uses).
const API = "https://apilist.tronscanapi.com/api/transfer/trx";
const PAGE_LIMIT = 50;

// Tronscan's own "direction" codes on /transfer/trx (same convention TronSave uses):
//   IN  = transfers received by the wallet -> client rental payments (fees)
//   OUT = transfers sent by the wallet     -> payouts to providers (supply side)
const IN = "2";
const OUT = "1";

// Labels used both on the balance lines and in breakdownMethodology.
const FEES_LABEL = "Energy & bandwidth rental fees";
const REVENUE_LABEL = "Rental Fees To Protocol";
const SUPPLY_LABEL = "Rental Fees To Providers";

async function sumTransfersTrx(
  direction: string,
  fromTimestamp: number,
  endTimestamp: number,
): Promise<number> {
  const apiKey = getEnv("TRONSCAN_API_KEY");
  const headers = apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
  let start = 0;
  let total = 0;

  while (true) {
    const url = new URL(API);
    const params: Record<string, string> = {
      address: WALLET,
      start: String(start),
      limit: String(PAGE_LIMIT),
      direction,
      reverse: "false",
      // FetchOptions timestamps are in seconds; Tronscan expects milliseconds.
      start_timestamp: String(fromTimestamp * 1000),
      end_timestamp: String(endTimestamp * 1000),
    };
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    const res = await limit(() => httpGet(url.toString(), { headers }));
    const rows: any[] = res?.data || [];
    if (!rows.length) break;

    total += rows.reduce((acc, tx) => acc + Number(tx?.amount || 0) / 1_000_000, 0);

    if ((res?.page_size ?? rows.length) < PAGE_LIMIT) break;
    start += PAGE_LIMIT;
  }
  return total;
}

const fetch = async (options: FetchOptions) => {
  const { createBalances, fromTimestamp, endTimestamp } = options;

  const feesTrx = await sumTransfersTrx(IN, fromTimestamp, endTimestamp); // paid in by clients
  const supplyTrx = await sumTransfersTrx(OUT, fromTimestamp, endTimestamp); // paid out to providers

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  dailyFees.addCGToken("tron", feesTrx, FEES_LABEL);
  dailySupplySideRevenue.addCGToken("tron", supplyTrx, SUPPLY_LABEL);
  // fees = revenue + supplySide  (no clamp, so the identity always holds).
  dailyRevenue.addCGToken("tron", feesTrx - supplyTrx, REVENUE_LABEL);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "TRX paid by clients for energy & bandwidth rentals — incoming transfers to the Tron Services wallet, read on-chain from Tronscan.",
  Revenue: "Platform margin kept: incoming client payments minus the TRX paid out to providers.",
  ProtocolRevenue: "Same as revenue; there is no governance token, so all revenue goes to the protocol.",
  SupplySideRevenue: "TRX paid out to the energy & bandwidth providers who fulfil the rentals (settled daily at 00:00 UTC).",
};

const breakdownMethodology = {
  Fees: { [FEES_LABEL]: "Full price paid by clients for energy & bandwidth rentals (incoming TRX)." },
  Revenue: { [REVENUE_LABEL]: "Client payments minus the TRX paid out to providers." },
  ProtocolRevenue: { [REVENUE_LABEL]: "Client payments minus the TRX paid out to providers." },
  SupplySideRevenue: { [SUPPLY_LABEL]: "TRX paid out to the energy & bandwidth providers." },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TRON],
  start: "2026-07-01", // TODO: set to the wallet-split day (energy/bandwidth-only) before shipping
  methodology,
  breakdownMethodology,
  // Providers are settled once per day (00:00 UTC), so daily granularity keeps the split exact.
  pullHourly: false,
  // Net revenue (fees − payouts) can be negative on days the daily payout exceeds that day's fees.
  allowNegativeValue: true,
};

export default adapter;
