import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// https://help.parcl.co/getting-started/nxKkvMYVGNLScHEvioJKJe/parcl-protocol-mechanics-/qCrhtrvt41v9fR9NExz9on
// "LPs retain 80% of the trading fees" - Parcl's docs confirm the split exists, but not
// which side of it this specific endpoint's `value` field reports. Two readings are both
// plausible and we could not find an authoritative source disambiguating them:
//   (a) `value` = gross trading fee (what's currently assumed below), split 80/20 here; or
//   (b) `value` = the LP's already-split 80% cut (the endpoint name is "lp-fee", not
//       "trading-fee" or "total-fee"), meaning gross = value / LP_SHARE.
// Kept as (a) - the existing, already-tested interpretation - rather than risk swapping to
// an equally-unproven (b). Flagged explicitly for a maintainer/CodeRabbit follow-up rather
// than silently picking a side.
const LP_SHARE = 0.8;

const fetch = async (options: FetchOptions) => {
  const startOfDay = options.startOfDay;
  const dateStr = new Date(startOfDay * 1000).toISOString().split('T')[0];

  const data = await httpGet("https://parcl-api.com/v1/time-series/cumulative-lp-fee?window=y", {
    headers: {
      "origin": "https://app.parcl.co",
      "referer": "https://app.parcl.co/",
    }
  });

  const dayData = data?.timeSeries?.find((item: any) => item.date.startsWith(dateStr));
  if (!dayData) {
    // The upstream API has previously gone dead for months at a time (window's timeSeries
    // stops advancing) while still returning HTTP 200 with older data. Reporting $0 in that
    // case is indistinguishable from a genuine no-activity day, so refuse instead.
    throw new Error(`Parcl: no data found for ${dateStr} in parcl-api.com's cumulative-lp-fee series (upstream may be dead/stale)`);
  }

  const dailyFees = dayData.value;
  const dailySupplySideRevenue = dailyFees * LP_SHARE;
  const dailyRevenue = dailyFees - dailySupplySideRevenue;

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SOLANA],
  fetch,
  start: '2024-06-01',
  methodology: {
    Fees: "Trading fees paid by traders, split between LPs and the protocol",
    SupplySideRevenue: "80% of trading fees, retained by LPs per Parcl's published fee split",
    Revenue: "20% of trading fees, kept by the protocol",
    ProtocolRevenue: "Protocol's 20% share of trading fees",
  },
  breakdownMethodology: {
    Fees: {
      "Trading Fees": "Trading fees paid by traders on Parcl perpetuals, from parcl-api.com's cumulative-lp-fee series.",
    },
    SupplySideRevenue: {
      "Trading Fees": "80% of trading fees, retained by LPs per Parcl's published fee split.",
    },
    Revenue: {
      "Trading Fees": "20% of trading fees, kept by the protocol.",
    },
    ProtocolRevenue: {
      "Trading Fees": "Protocol's 20% share of trading fees.",
    },
  },
};

export default adapter;
