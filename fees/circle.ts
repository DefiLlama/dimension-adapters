import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { buildStablecoinAdapter } from "../helpers/attestations-stablecoins";

const adapter = buildStablecoinAdapter(CHAIN.OFF_CHAIN, '2', 30,
    // Based on https://www.circle.com/en/transparency
    [
        {
            time: '2024-10',
            circulation: 34.5,
            allocated: 10.6 + 18.9,
            tbillRate: 4.47
        },
        {
            time: '2024-09', // time of report
            circulation: 35.7, // billions of USDC in circulation
            allocated: 8.8 + 21.3, // billions in tbills + repos + money market funds
            tbillRate: 5.287 // % interest earned in treasury bills
        },
        {
            time: '2024-08',
            circulation: 34.4,
            allocated: 8.6 + 21.2,
            tbillRate: 4.98
        },
        {
            time: '2024-07',
            circulation: 33.3,
            allocated: 8.4 + 16,
            tbillRate: 5.14
        },
        {
            time: '2024-06',
            circulation: 31.9,
            allocated: 10.7 + 17,
            tbillRate: 5.22
        },
        {
            time: '2024-05',
            circulation: 31.8,
            allocated: 11.6 + 16.5,
            tbillRate: 5.26
        },
        {
            time: '2024-04',
            circulation: 32.6,
            allocated: 10.4 + 18.7,
            tbillRate: 5.25
        },
        {
            time: '2024-03',
            circulation: 31.8,
            allocated: 11.4 + 15.9,
            tbillRate: 5.23
        },
        {
            time: '2024-02',
            circulation: 27.2,
            allocated: 10 + 14.5,
            tbillRate: 5.24
        },
        {
            time: '2024-01',
            circulation: 25.6,
            allocated: 7.4 + 15.3,
            tbillRate: 5.21
        },
        {
            time: '2023-12',
            circulation: 24.6,
            allocated: 6.6 + 14.7,
            tbillRate: 5.2
        },
        {
            time: '2023-11',
            circulation: 24.5,
            allocated: 7.2 + 14.6,
            tbillRate: 5.25
        },
        {
            time: '2023-10',
            circulation: 24.7,
            allocated: 8.1 + 14.5,
            tbillRate: 5.33
        },
        {
            time: '2023-09',
            circulation: 24.9,
            allocated: 9 + 13.9,
            tbillRate: 5.32
        },
        {
            time: '2023-08',
            circulation: 26.2,
            allocated: 8.9 + 14.5,
            tbillRate: 5.32
        },
        {
            time: '2023-07',
            circulation: 26.3,
            allocated: 5.6 + 17.4,
            tbillRate: 5.28
        },
        {
            time: '2023-06',
            circulation: 27.4,
            allocated: 5.4 + 18.5,
            tbillRate: 5.17
        },
        {
            time: '2023-05',
            circulation: 28.9, // only held repos at the end of the month
            allocated: 0 + 22.9,
            tbillRate: 5.28
        },
        {
            time: '2023-04',
            circulation: 30.5,
            allocated: 30.1,  // only held tbills at end of month
            tbillRate: 4.95
        },
        {
            time: '2023-03',
            circulation: 32.5,
            allocated: 28.5, // only held tbills at end of month
            tbillRate: 4.8
        },
        {
            time: '2023-02',
            circulation: 42.4,
            allocated: 31.7, // only held tbills at end of month
            tbillRate: 4.72
        },
        {
            time: '2023-01',
            circulation: 42.3,
            allocated: 33.7, // only held tbills at end of month
            tbillRate: 4.59
        },
        {
            time: '2022-12',
            circulation: 44.5,
            allocated: 23.4 + 10.5,
            tbillRate: 4.3
        },
        {
            time: '2022-11',
            circulation: 42.8,
            allocated: 12.8 + 19.4,
            tbillRate: 4.27
        },
        {
            time: '2022-10',
            circulation: 43.5,
            allocated: 35.7,
            tbillRate: 4.06
        },
        {
            time: '2022-09',
            circulation: 47.3,
            allocated: 38.3,
            tbillRate: 3.22
        },
        {
            time: '2022-08',
            circulation: 52.3,
            allocated: 43.5,
            tbillRate: 2.88
        },
        {
            time: '2022-07',
            circulation: 54.5,
            allocated: 42.4,
            tbillRate: 2.34
        },
        /* { 
             time: '2022-06', 
             circulation: 55.6, 
             allocated: , // no allocation info
             tbillRate: 1.66
         },
         {
             time: '2022-05', 
             circulation: 54, 
             allocated: , // no allocation info
             tbillRate: 1.13
         },
         {
             time: '2022-04', 
             circulation: 49.3, 
             allocated: , // no allocation info
             tbillRate: 0.83
         },
         {
             time: '2022-03', 
             circulation: 51.4, 
             allocated: , // no allocation info
             tbillRate: 0.55
         },
         {
             time: '2022-02', 
             circulation: 53.5, 
             allocated: , // no allocation info
             tbillRate: 0.37
         },
         {
             time: '2022-01', 
             circulation: 50, 
             allocated: , // no allocation info
             tbillRate: 0.24
         },*/

    ]);

adapter.methodology = {
    Fees: 'All yields from USDC backing cash-equivalent assets, and US Treasury Bills.',
    Revenue: 'All yields from USDC backing cash-equivalent assets, and US Treasury Bills collected by Circle.',
    ProtocolRevenue: 'All yields from USDC backing cash-equivalent assets, and US Treasury Bills collected by Circle.',
}

adapter.breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: 'All yields from USDC backing cash-equivalent assets, and US Treasury Bills.',
    },
    Revenue: {
        [METRIC.ASSETS_YIELDS]: 'All yields from USDC backing cash-equivalent assets, and US Treasury Bills collected by Circle.',
    },
    ProtocolRevenue: {
        [METRIC.ASSETS_YIELDS]: 'All yields from USDC backing cash-equivalent assets, and US Treasury Bills collected by Circle.',
    },
}

export default adapter