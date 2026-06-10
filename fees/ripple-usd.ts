import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { buildStablecoinAdapter } from "../helpers/attestations-stablecoins";

// { time, circulation (in billions), allocated (in billions), tbillRate? (in %) }
// allocated = U.S. Treasury bills + government money-market funds; cash deposits
// at U.S. regulated financial institutions are excluded per the helper convention.
// Figures are month-end values from the monthly RLUSD attestation reports issued
// by Standard Custody & Trust Company, LLC (Ripple) and examined by Deloitte:
// https://ripple.com/solutions/stablecoin/transparency/
const adapter = buildStablecoinAdapter(CHAIN.OFF_CHAIN, '250', 30, [
  {
    time: '2026-04',
    circulation: 1.44,
    allocated: 1.30, // 1,033.3m tbills + 263.4m money-market funds
  },
  {
    time: '2026-03',
    circulation: 1.24,
    allocated: 1.08, // 931.5m tbills + 146.6m money-market funds
  },
  {
    time: '2026-02',
    circulation: 1.50,
    allocated: 1.31, // 890.8m tbills + 423.3m money-market funds
  },
  {
    time: '2026-01',
    circulation: 1.36,
    allocated: 1.24, // 838.8m tbills + 403.1m money-market funds
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

adapter.start = '2026-01-01';

export default adapter;
