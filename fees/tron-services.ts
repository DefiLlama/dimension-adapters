import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";
const plimit = require("p-limit");
const limit = plimit(1);

/**
 * Tron Services — energy & bandwidth rental marketplace on TRON.
 *
 * Fees are read on-chain: every TRX transfer received by the platform wallet is
 * a client paying for an energy or bandwidth rental. We sum those incoming
 * transfers from Tronscan (same data source TronSave uses).
 *
 * Tron Services is a marketplace: most of each fee is paid out to the provider
 * that supplies the resource, and the platform keeps a 15% fee.
 *   revenue    = fees * PROTOCOL_FEE_RATE
 *   supplySide = fees * (1 - PROTOCOL_FEE_RATE)
 * Both are derived from the on-chain fee total, so the income-statement identity
 * fees = revenue + supplySide always holds and neither can go negative.
 */

// Public platform wallet that receives all rental payments. Verifiable on Tronscan:
// https://tronscan.org/#/address/TEU6avyp6qTHy4JjuetZi9eAPT4VSmD19b
const WALLET = "TEU6avyp6qTHy4JjuetZi9eAPT4VSmD19b";
// Tronscan public transfers endpoint.
const API = "https://apilist.tronscanapi.com/api/transfer/trx";
const PAGE_LIMIT = 50;
// Tronscan "direction" code: "2" = transfers received by the wallet (same convention TronSave uses).
const INCOMING = "2";
// Platform fee rate on rentals: the 15% margin kept; the rest is paid out to providers.
const PROTOCOL_FEE_RATE = 0.15;

const FEES_LABEL = "Energy & bandwidth rental fees";
const REVENUE_LABEL = "Rental Fees To Protocol";
const SUPPLY_LABEL = "Rental Fees To Providers";

// Sum every TRX transfer received by WALLET in [fromTimestamp, endTimestamp), in TRX.
async function sumIncomingTrx(fromTimestamp: number, endTimestamp: number): Promise<number> {
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
      direction: INCOMING,
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

  const feesTrx = await sumIncomingTrx(fromTimestamp, endTimestamp);
  const revenueTrx = feesTrx * PROTOCOL_FEE_RATE;
  const supplyTrx = feesTrx - revenueTrx;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  dailyFees.addCGToken("tron", feesTrx, FEES_LABEL);
  dailyRevenue.addCGToken("tron", revenueTrx, REVENUE_LABEL);
  dailySupplySideRevenue.addCGToken("tron", supplyTrx, SUPPLY_LABEL);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "TRX paid by clients for energy & bandwidth rentals, read on-chain as incoming transfers to the platform wallet on Tronscan.",
  Revenue: "The margin the platform keeps — 15% of the rental fees.",
  ProtocolRevenue: "The margin the platform keeps — 15% of the rental fees.",
  SupplySideRevenue: "The portion (85%) of energy & bandwidth rental fees paid out to the energy & bandwidth providers that supply the resource.",
};

const breakdownMethodology = {
  Fees: { [FEES_LABEL]: "Full price paid by clients for energy & bandwidth rentals (incoming TRX)." },
  Revenue: { [REVENUE_LABEL]: "Platform margin kept (15% of fees)." },
  ProtocolRevenue: { [REVENUE_LABEL]: "Platform margin kept (15% of fees)." },
  SupplySideRevenue: { [SUPPLY_LABEL]: "Paid out to the energy & bandwidth providers (85% of fees)." },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TRON],
  start: "2026-06-14", // platform launch — first on-chain rental payments
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
