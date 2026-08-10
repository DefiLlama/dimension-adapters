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
    time: '2026-04',
    circulation: 1.44,
    allocated: 1.03 + 0.263,
  },
  {
    time: '2026-03',
    circulation: 1.24,
    allocated: 0.93 + 0.146,
  },
  {
    time: '2026-02',
    circulation: 1.5,
    allocated: 0.89 + 0.423,
  },
  {
    time: '2026-01',
    circulation: 1.358,
    allocated: 0.839 + 0.403
  },
  {
    time: '2025-12',
    circulation: 1.28,
    allocated: 0.338 + 0.867,
  },
  {
    time: '2025-11',
    circulation: 1.26,
    allocated: 0.712 + 0.382,
  },
  {
    time: '2025-10',
    circulation: 0.963,
    allocated: 0.526 + 0.282,
  },
  {
    time: '2025-09',
    circulation: 0.789,
    allocated: 0.451 + 0.249,
  },
  {
    time: '2025-08',
    circulation: 0.701,
    allocated: 0.394 + 0.225,
  },
  {
    time: '2025-07',
    circulation: 0.602,
    allocated: 0.33 + 0.177
  },
  {
    time: '2025-06',
    circulation: 0.456,
    allocated: 0.401
  },
  {
    time: '2025-05',
    circulation: 0.301,
    allocated: 0.181 + 0.098,
  },
  {
    time: '2025-04',
    circulation: 0.317,
    allocated: 0.14 + 0.141,
  },
  {
    time: '2025-03',
    circulation: 0.193,
    allocated: 0.07 + 0.082,
  },
  {
    time: '2025-02',
    circulation: 0.13,
    allocated: 0.052 + 0.046,
  },
  {
    time: '2025-01',
    circulation: 0.1067,
    allocated: 0.042 + 0.042,
  },
  {
    time: '2024-12',
    circulation: 0.077,
    allocated: 0.030 + 0.020,
  }
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

adapter.start = '2024-11-01';

export default adapter;
