import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getSolanaReceived } from "../helpers/token";

// Monolith Exchange (https://monolith.exchange) routes swaps through Jupiter's Swap V2 API with a
// 0.5% integrator fee (referralFee = 50 bps). Jupiter collects the fee into the referral token
// accounts of Monolith's referral account GKcAVVJFKc2YV91jHgQDwZWqfbT4aGtyakY1ximp8Xj4
// (Jupiter Referral Program, REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3), one account per fee
// mint. Jupiter picks the fee mint (mostly SOL, then stablecoins).
// Sample fee transfers (SOL, USDC):
// 5qUR2vGGE6nHtiR8QD9hQhsd4ehLgE27i8VkLdgsrvM1UhKrywpTbgS8QAj6euFQPXeHJVfxqxqtd2Yer5ENgupF
// LDvbkPqg6PFihUTZmtKTQotBc1MkZ4Kew26YzqptpSFSsmstGZSprUFA4QAMckZ7sLeMuMRgzZ6eE8UA8tCuu4Z
const REFERRAL_TOKEN_ACCOUNTS = [
  'F6nQT47E6tBvcbtR332MTm9KijXS4xNN1FR9U79ZeTuj', // SOL
  '2iDBReKsWwSVk2CWKK435tHWc9FhLoX7cKU4gDZ86pSq', // USDC
  '3r926hZ6TqY7MFZZTQVQVojrfWEZzxnEEXw4qftPAveJ', // USDT
  'AWb9w7zzuVP5Q9skvUxN6dL8FiAccgFedgPZYGahin89', // PYUSD
  'ESdzZgBPMei3DvhcgSeNZPHKSyrgyafzHmF4czpspYCc', // USDG
  '9KBHy2sc4nWSTGATHxWXSLx7FhDhjFwQwcGqcfv9V9jL', // USD1
  '7Fm2tHMNvXWqseu5RjTqqr6hAohqYAb2KbCnP2DynYhm', // JupUSD
  'FvfVHAbb4q3iYBzmSvDMaBJDRi1Ddt3uCjmotVusrr9g', // EURC
  '8FqXF375MjFuCtBTq3V78VNEJCn8XkuUBrXLWFHDeWYe', // jlUSDC
  'EmPAoNzvHe9V5G7GZPsnfi6ZJDbMVAY4XSqZLHAuVqpJ', // JupSOL
  '7S8UCihKiTfjyJz6nd4oo74sw7zMvzMyHswyCAEMc42C', // JitoSOL
  '6KNHjJ1nTVLhAFETAwTYH9fBvnGZSuw2jYGykWVsP3a7', // mSOL
  'Dfrdr74HjE4jagHoYaQcQLT3iZQAfGdPR1mCPjvCZ6zV', // cbBTC
  'BwU9XuEieXqLh4A6XAmyePgkXcd8gRV4X9mZMa1wXEZp', // WBTC
  'EoKRLPsMHh1MMuGvg96pzWwtKGBRjrYirpH57SGtjR6a', // ETH
  'FDxFb8adMhSE8xd6M9NAxMcXMSYNUVGDQkyfLuRM7u5C', // JUP
  'ATfDXpkCPb8Meor6ApuaFvNKZ9hg6sq8wPeFUjvokSE9', // JLP
  '971xn9aGnccUkgxr4gUvsz5wU75cJAkRRE4pawgwxWcP', // JTO
  'EmZURhiUghEE8D9a5GcgHCmbvipKhuW6GcRKyBoxxpYF', // RAY
  'D65xsSUHvfF5wqenNU7Ka5gqBgmG7qWkrwswVkXbEsQs', // ORCA
  'C3yYUPXVntgbFHnoRTiX5Wje67CckHADvxCvTbFAsEUY', // MET
  '38MENfw6iBNpopFLmhRiUrqYB6s8USdCSzxoiTUY99YV', // KMNO
  '2fCpESQnmgqQRUaCGKNh8Kxi1PrqosHUL2J5mbFwkH7v', // ONDO
  '7YHV3F8BspeyaEBzifYjv5BwhQNrqpRwSkEzB1RbQoNp', // HYPE
  'HJfYZLdPE5HQDiEyt1X8ksfvRaSuRQ5U8x3KxHfkpbvc', // BONK
  'A2FfCztTvcyWUMkMJYM1PwxTPZhFe9EAYKVbeXX74Yp7', // WIF
  'EHVG4EdxfRC3GxVbs7UbvH3wP3cE1VnRix4JQJGddffN', // PENGU
  'B6UoDWuCWF9uiWoCHLzTWdY2847o1xe2pVxUHP2LnpZV', // TRUMP
  'C35pSmPzbHg7mY7S42jyvY9WYGY3Sad457YxaT65xwiw', // POPCAT
  '9VN6tAhQKEosHV8G28Yg7ZV7NrcLsrr8Ts3gzH78Rged', // Fartcoin
  'wRUXKXybX39XhRm5ftvbzvWWvLkiLqJW2pGYRaNmJTM', // BP
  '3YPnNFozEGypxAwD8H4Yu8fxSKGAH8hh8eY32RB2bozc', // PUMP
];

// Jupiter keeps 20% of the integrator fee ("Jupiter takes 20% of your integrator fee"), sent to
// Jupiter when Monolith claims the referral accounts:
// https://developers.jup.ag/docs/swap/order-and-execute
const JUPITER_SHARE = 0.2;

const fetch = async (options: FetchOptions) => {
  const swapFees = await getSolanaReceived({
    options,
    targets: REFERRAL_TOKEN_ACCOUNTS,
    // Claims and moves between Monolith's own fee accounts are not new fees.
    blacklists: REFERRAL_TOKEN_ACCOUNTS,
  });

  const dailyFees = swapFees.clone(1, METRIC.SWAP_FEES);
  const dailySupplySideRevenue = swapFees.clone(JUPITER_SHARE, 'Swap Fees To Jupiter');
  const dailyRevenue = swapFees.clone(1 - JUPITER_SHARE, 'Swap Fees To Monolith');

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-10-06',
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'The 0.5% fee users pay on every swap made through Monolith Exchange, collected by Jupiter into Monolith\'s referral fee accounts.',
    UserFees: 'The 0.5% fee users pay on every swap made through Monolith Exchange.',
    Revenue: 'The 80% of the 0.5% swap fee that Monolith Exchange keeps after Jupiter\'s 20% share.',
    ProtocolRevenue: 'The 80% of the 0.5% swap fee that goes to the Monolith Exchange treasury.',
    SupplySideRevenue: 'The 20% of the 0.5% swap fee that Jupiter keeps as the routing provider.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: '0.5% fee on swaps routed through Jupiter, collected in the fee mint Jupiter selects.',
    },
    UserFees: {
      [METRIC.SWAP_FEES]: '0.5% fee on swaps routed through Jupiter, paid by users.',
    },
    Revenue: {
      'Swap Fees To Monolith': '80% of the 0.5% swap fee, kept by Monolith Exchange.',
    },
    ProtocolRevenue: {
      'Swap Fees To Monolith': '80% of the 0.5% swap fee, kept by Monolith Exchange.',
    },
    SupplySideRevenue: {
      'Swap Fees To Jupiter': '20% of the 0.5% swap fee, kept by Jupiter.',
    },
  },
};

export default adapter;
