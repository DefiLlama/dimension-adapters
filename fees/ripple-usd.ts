import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { buildStablecoinAdapter } from "../helpers/attestations-stablecoins";

// { time, circulation (in billions), allocated (in billions), tbillRate? (in %) }
// allocated = U.S. Treasury bills + government money-market funds; cash deposits
// at U.S. regulated financial institutions are excluded per the helper convention.
// Each monthly RLUSD attestation report (Standard Custody & Trust Company, LLC /
// Ripple, examined by Deloitte) states reserves as of TWO explicit report dates
// (mid-month and month-end); all are included below with their exact dates so
// nearest-attestation selection never reaches far forward in time:
// https://ripple.com/solutions/stablecoin/transparency/
const adapter = buildStablecoinAdapter(CHAIN.OFF_CHAIN, '250', 30, [
  {
    time: '2026-04-30',
    circulation: 1.44,
    allocated: 1.30, // 1,033.3m tbills + 263.4m money-market funds
  },
  {
    time: '2026-04-24',
    circulation: 1.54,
    allocated: 1.37, // 999.6m tbills + 367.5m money-market funds
  },
  {
    time: '2026-03-31',
    circulation: 1.24,
    allocated: 1.08, // 931.5m tbills + 146.6m money-market funds
  },
  {
    time: '2026-03-13',
    circulation: 1.55,
    allocated: 1.38, // 914.8m tbills + 464.8m money-market funds
  },
  {
    time: '2026-02-27',
    circulation: 1.50,
    allocated: 1.31, // 890.8m tbills + 423.3m money-market funds
  },
  {
    time: '2026-02-19',
    circulation: 1.54,
    allocated: 1.33, // 863.4m tbills + 464.9m money-market funds
  },
  {
    time: '2026-01-30',
    circulation: 1.36,
    allocated: 1.24, // 838.8m tbills + 403.1m money-market funds
  },
  {
    time: '2026-01-14',
    circulation: 1.39,
    allocated: 1.23, // 696.4m tbills + 533.8m money-market funds
  },
]);

adapter.methodology = {
  Fees: 'All yields from RLUSD backing assets (U.S. Treasury bills and government money-market funds).',
  Revenue: 'All yields from RLUSD backing assets (U.S. Treasury bills and government money-market funds) collected by Standard Custody & Trust Company (Ripple).',
  ProtocolRevenue: 'All yields from RLUSD backing assets (U.S. Treasury bills and government money-market funds) collected by Standard Custody & Trust Company (Ripple).',
}

adapter.breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'All yields from RLUSD backing assets (U.S. Treasury bills and government money-market funds).',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'All yields from RLUSD backing assets (U.S. Treasury bills and government money-market funds) collected by Standard Custody & Trust Company (Ripple).',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: 'All yields from RLUSD backing assets (U.S. Treasury bills and government money-market funds) collected by Standard Custody & Trust Company (Ripple).',
  },
}

adapter.start = '2026-01-14'; // first attestation report date — no earlier sourced data

export default adapter;
