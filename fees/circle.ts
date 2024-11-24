import { buildStablecoinAdapter} from "./tether/attestations-stablecoins";

export default buildStablecoinAdapter('2',
// Based on https://www.circle.com/en/transparency
[
    {
        time: '2024-09', // time of report
        circulation: 35.7, // billions of USDC in circulation
        allocated: 8.8 + 21.3, // billions in tbills + repos + money market funds
        tbillRate: 5.287 // % interest earned in treasury bills
    }

]);