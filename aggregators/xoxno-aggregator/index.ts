import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Window totals indexed by XOXNO from the swap-aggregator router's events.
// Router (Stellar mainnet): CCVENFSVCBYDHVOACFZXMNNYVOZ3LKXPZYU5LUI4N7KTXOKRVYD7F3TR
// Event topics ["router", "swap"]; data map { sender, token_in, token_out,
// amount_in, amount_out, referral_id, fee_token, static_fee, referral_fee },
// published once per successful swap. static_fee goes to the protocol and
// referral_fee to the referral partner, both in fee_token.
const API_BASE = "https://api.xoxno.com";
const TOTALS_EXPORT_PATH = "/integrations/swap/stellar/totals";
const HEADERS = { "User-Agent": "dune-analytics" };
const REQUEST_TIMEOUT_MS = 10_000;

const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";
const SWAP_FEES_TO_REFERRERS = "Swap Fees To Referrers";

type TotalsExport = {
  volumeUsd?: number;
  protocolFeeUsd?: number;
  referralFeeUsd?: number;
};

// The export always sends finite numbers. Anything else (null, a string, a
// missing field) means the data is unavailable: throw rather than coerce it
// to a number and record a false value.
function usd(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`XOXNO aggregator export returned an invalid USD value: ${value}`);
  }
  return value;
}

const fetch_ = async (options: FetchOptions) => {
  // The export sums [from, to). endTimestamp (= toTimestamp + 1) is the
  // exclusive end, so consecutive hourly windows tile the day exactly.
  const url = `${API_BASE}${TOTALS_EXPORT_PATH}?from=${options.startTimestamp}&to=${options.endTimestamp}`;

  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`XOXNO aggregator totals export failed: ${response.status}`);
  }

  const data = (await response.json()) as TotalsExport;
  const protocolFees = usd(data.protocolFeeUsd);
  const referralFees = usd(data.referralFeeUsd);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.addUSDValue(usd(data.volumeUsd));
  dailyFees.addUSDValue(protocolFees + referralFees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(protocolFees, SWAP_FEES_TO_PROTOCOL);
  dailySupplySideRevenue.addUSDValue(referralFees, SWAP_FEES_TO_REFERRERS);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Input amount of every swap routed through the XOXNO swap-aggregator router on Stellar, valued in USD at swap time. Includes swaps from wallets, integrator contracts and XOXNO lending strategies, each counted once on its input leg.",
  Fees: "The aggregator's own fee on each swap: the protocol (static) fee plus the referral partner fee, charged only on swaps with an active referral. Fees of the underlying DEX pools are not included.",
  Revenue: "The protocol (static) fee kept by XOXNO.",
  ProtocolRevenue: "The protocol (static) fee kept by XOXNO.",
  SupplySideRevenue: "The referral fee paid to the referral partner of each swap.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "Protocol fee plus referral fee charged by the XOXNO router on each referred swap.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol (static) fee kept by XOXNO.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol (static) fee kept by XOXNO.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_REFERRERS]: "The referral fee paid to the referral partner of each swap.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetch_,
  chains: [CHAIN.STELLAR],
  start: "2026-11-19",
  methodology,
  breakdownMethodology,
};

export default adapter;
