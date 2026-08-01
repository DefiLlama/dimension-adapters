import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { buildStablecoinAdapter } from "../../helpers/attestations-stablecoins";

// { time, circulation (in billions), allocated (in billions), tbillRate? (in %) }
const adapter = buildStablecoinAdapter(CHAIN.OFF_CHAIN, '262', 30,
  // https://worldlibertyfinancial.com/usd1/attestation-reports
  [
    {
      time: '2026-04',
      circulation: 4.5,
      allocated: 3.8,
    },
    {
      time: '2026-03',
      circulation: 4.4,
      allocated: 3.4,
    },
    {
      time: '2026-02',
      circulation: 4.7,
      allocated: 4.0,
    },
    {
      time: '2026-01',
      circulation: 5.0,
      allocated: 4.5,
    },
    {
      time: '2025-12',
      circulation: 3.3,
      allocated: 2.8,
    },
    {
      time: '2025-11',
      circulation: 2.7,
      allocated: 2.3,
    },
    {
      time: '2025-10',
      circulation: 2.6,
      allocated: 2.3,
    },
    {
      time: '2025-09',
      circulation: 2.6,
      allocated: 2.3,
    },
    {
      time: '2025-08',
      circulation: 2.6,
      allocated: 2.2,
    },
    {
      time: '2025-07',
      circulation: 2.2,
      allocated: 1.9,
    },
    {
      time: '2025-06',
      circulation: 2.2,
      allocated: 1.9,
    },
    {
      time: '2025-05',
      circulation: 2.2,
      allocated: 1.9,
    },
    {
      time: '2025-04',
      circulation: 2.1,
      allocated: 2.1,
    },

  ]);

adapter.methodology = {
  Fees: 'All yields from USD1 backing assets investments (Fidelity money market funds).',
  Revenue: 'All yields from USD1 backing assets investments (Fidelity money market funds) collected by World Liberty Financial.',
  ProtocolRevenue: 'All yields from USD1 backing assets investments (Fidelity money market funds) collected by World Liberty Financial.',
}

adapter.breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'All yields from USD1 backing assets investments (Fidelity money market funds).',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'All yields from USD1 backing assets investments (Fidelity money market funds) collected by World Liberty Financial.',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: 'All yields from USD1 backing assets investments (Fidelity money market funds) collected by World Liberty Financial.',
  },
}

adapter.start = '2025-04-28';

export default adapter
