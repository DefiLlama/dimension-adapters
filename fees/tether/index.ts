import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { buildStablecoinAdapter } from "../../helpers/attestations-stablecoins";

const adapter = buildStablecoinAdapter(CHAIN.OFF_CHAIN, '1', 30 * 3,
  // Based on https://tether.to/en/transparency/?tab=reports
  [
    {
      time: '2026-03',
      circulation: 183.5,
      allocated: 117 + 19.3 + 4.7 + 15.8, // Tbill + overnight repo + term repo + secured loans,
    },
    {
      time: '2025-12',
      circulation: 186.5,
      allocated: 122.3 + 19.3 + 5.5 + 17,
    },
    {
      time: '2025-09',
      circulation: 174.4,
      allocated: 112.4 + 18 + 3 + 6.4 + 14.6,
    },
    {
      time: '2025-06',
      circulation: 157.1,
      allocated: 105.5 + 16.3 + 1.7 + 6.3 + 10.1,
    },
    {
      time: '2025-03',
      circulation: 143.7,
      allocated: 98.5 + 15.1 + 1.6 + 6.3 + 8.8,
    },
    {
      time: '2024-12',
      circulation: 136.6,
      allocated: 94.5 + 14.1 + 3.1 + 6.5 + 8.2,
    },
    {
      time: '2024-09', // time of report
      circulation: 119.3, // billions of USDT in circulation
      allocated: 84.5 + 12.5 + 1.5 + 6.4 + 6.7, // billions in tbills + repos + money market funds
      tbillRate: 5.287, // % interest earned in treasury bills
    },
    {
      time: '2024-06',
      circulation: 112.8,
      allocated: 80.9 + 11.3 + 1 + 6.4 + 6.6,
      tbillRate: 5.24,
    },
    {
      time: '2024-03',
      circulation: 104.5,
      allocated: 74.05 + 11.3 + 0.8 + 6.3 + 4.7,
      tbillRate: 5.23,
    },
    {
      time: '2023-12',
      circulation: 91.6,
      allocated: 63.1 + 9.4 + 0.8 + 8.3 + 4.8,
      tbillRate: 5.2,
    },
    {
      time: '2023-09',
      circulation: 83.2,
      allocated: 56.6 + 8.2 + 0.6 + 8.2 + 5.2,
      tbillRate: 5.32,
    },
    {
      time: '2023-06',
      circulation: 83.4,
      allocated: 55.8 + 8.9 + 0.6 + 8.1 + 5.5,
      tbillRate: 5.17,
    },
    {
      time: '2023-03',
      circulation: 79.6,
      allocated: 53.04 + 7.5 + 0.79 + 7.5 + 5.3,
      tbillRate: 4.8,
    },
    {
      time: '2022-12',
      circulation: 66.3,
      allocated: 39.2 + 7.4 + 3.05 + 5.9,
      tbillRate: 4.3
    },
    {
      time: '2022-09',
      circulation: 67.9,
      allocated: 39.7 + 7.1 + 3.02 + 6.1,
      tbillRate: 3.22
    },
    {
      time: '2022-06',
      circulation: 66.5,
      allocated: 28.9 + 8.4 + 6.8 + 3 + 4.5,
      tbillRate: 1.66
    },
    {
      time: '2022-03',
      circulation: 82.6,
      allocated: 39.2 + 6.8 + 0.1 + 20.1 + 3.1,
      tbillRate: 0.51
    },
    {
      time: '2021-12',
      circulation: 78.34,
      allocated: 34.5 + 3 + 24.1 + 4.1 + 3.6 + 5.02,
      tbillRate: 0.05
    },
    {
      time: '2021-09',
      circulation: 69.2,
      allocated: 1 + 19.4 + 30.6 + 3.5,
      tbillRate: 0.04
    },
    {
      time: '2021-06',
      circulation: 62.8,
      allocated: 1 + 15.3 + 30.8 + 2.5,
      tbillRate: 0.04
    },
    /*{ Allocations not provided in the Tether Assurance
        time: '2021-03', 
        circulation: 40.8,
        allocated: null,
        tbillRate: 0.02 
    },
    {
        time: '2021-02', 
        circulation: 34.98, 
        allocated: null, 
        tbillRate: 0.04 
    },
    {
        time: '2018-10', 
        circulation: 2.8, 
        allocated: null, 
        tbillRate: 2.24 
    },
    {
        time: '2018-06', 
        circulation: 2.8, 
        allocated: null, 
        tbillRate: 1.88 
    },
    {
        time: '2017-09', 
        circulation: 0.4, 
        allocated: null, 
        tbillRate: 1.00s
    },*/

  ]);

adapter.methodology = {
  Fees: 'All yields from USDT backing asset investments (US Treasury Bills, other fixed-income assets), price fluctuations in gold, and bitcoin held in the Tether reserves. Price fluctuations in other backing assets are excluded.',
  Revenue: 'All yields from USDT backing assets investments (US Treasury Bills, other fixed income assets) price fluctuations in gold, and bitcoin held in the Tether reserves.',
  ProtocolRevenue: 'All yields from USDT backing assets investments (US Treasury Bills, other fixed income assets) price fluctuations in gold, and bitcoin held in the Tether reserves.',
}

adapter.breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Asset yields from US treasury bills, other fixed income assets like repos, commercial paper, money market funds and secured loans.',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Asset yields from US treasury bills, other fixed income assets like repos, commercial paper, money market funds and secured loans collected by Tether.',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Asset yields from US treasury bills, other fixed income assets like repos, commercial paper, money market funds and secured loans collected by Tether.',
  },
}

export default adapter
