import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { buildStablecoinAdapter} from "./attestations-stablecoins";

const adapter = buildStablecoinAdapter(CHAIN.OFF_CHAIN, '1', 30* 3,
// Based on https://tether.to/en/transparency/?tab=reports
[
    {
        time: '2024-09', // time of report
        circulation: 119.3, // billions of USDT in circulation
        allocated: 84.5 + 12.5 + 1.5 + 6.4, // billions in tbills + repos + money market funds
        tbillRate: 5.287 // % interest earned in treasury bills
    },
    {
        time: '2024-06', 
        circulation: 112.8, 
        allocated: 80.9 + 11.3 + 1 + 6.4,
        tbillRate:  5.24 
    },
    {
        time: '2024-03', 
        circulation: 104.5, 
        allocated: 74.05 + 11.3 + 0.8 + 6.3, 
        tbillRate: 5.23 
    },
    {
        time: '2023-12', 
        circulation: 91.6, 
        allocated: 63.1 + 9.4 + 0.8 + 8.3, 
        tbillRate: 5.2 
    },
    {
        time: '2023-09', 
        circulation: 83.2, 
        allocated: 56.6 + 8.2 + 0.6 + 8.2, 
        tbillRate: 5.32 
    },
    {
        time: '2023-06', 
        circulation: 83.4, 
        allocated: 55.8 + 8.9 + 0.6 + 8.1, 
        tbillRate: 5.17 
    },
    {
        time: '2023-03', 
        circulation: 79.6, 
        allocated: 53.04 + 7.5 + 0.79 + 7.4, 
        tbillRate: 4.8 
    },
    {
        time: '2022-12', 
        circulation: 66.3, 
        allocated: 39.2 + 7.4 + 3.05, 
        tbillRate: 4.3 
    },
    {
        time: '2022-09', 
        circulation: 67.9, 
        allocated: 39.7 + 7.1 + 3.02, 
        tbillRate: 3.22 
    },
    {
        time: '2022-06', 
        circulation: 66.5, 
        allocated: 28.9 + 6.8 + 3, //(not included) paper deposits and ceritificates 8.4 
        tbillRate: 1.66 
    },
    {
        time: '2022-03', 
        circulation:  82.6, 
        allocated: 39.2 + 6.8 + 0.1, // (not included) paper deposits and ceritificates 20.1 
        tbillRate: 0.51 
    },
    {
        time: '2021-12', 
        circulation: 78.34, 
        allocated: 34.5 + 3 , //(not included) paper deposits and ceritificates 24.2 , Other Investments (including digital tokens) 5.02 Secured Loans (none to affiliated entities) 4.1 Corporate Bonds, Funds & Precious Metals 3.6 
        tbillRate: 0.05 
    },
    {
        time: '2021-09', 
        circulation: 69.2, 
        allocated: 1 + 19.4, //(not included) Secured Loans (none to affiliated entities) $3,452,029,190  Corporate Bonds, Funds & Precious Metals $3,607,629,331  Other Investments (including digital tokens) $3,830,441,303 
        tbillRate: 0.04 
    },
    {
        time: '2021-06', 
        circulation: 62.8, 
        allocated: 1 + 15.3, //(not included) Secured Loans (none to affiliated entities) $2,517,140,390  Corporate Bonds, Funds & Precious Metals $4,830,821,277  Other Investments (including digital tokens) $2,054,626,204 
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
    Fees: 'All yields from USDT backing assets investments, mostly US Treasury Bills.',
    Revenue: 'All yields from USDT backing assets investments, mostly US Treasury Bills collected by Tether.',
    ProtocolRevenue: 'All yields from USDT backing assets investments, mostly US Treasury Bills collected by Tether.',
}

adapter.breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: 'All yields from USDT backing assets investments, mostly US Treasury Bills.',
    },
    Revenue: {
        [METRIC.ASSETS_YIELDS]: 'All yields from USDT backing assets investments, mostly US Treasury Bills collected by Tether.',
    },
    ProtocolRevenue: {
        [METRIC.ASSETS_YIELDS]: 'All yields from USDT backing assets investments, mostly US Treasury Bills collected by Tether.',
    },
}

export default adapter
