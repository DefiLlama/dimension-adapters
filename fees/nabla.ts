import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const INTEGRATOR_FEES = 'Integrator Fees';
const REFERRAL_FEES = 'Referral Fees To Jupiter';

// NABLA (https://www.nabladefi.com) routes its swaps through Jupiter and charges a 0.50% integrator fee, taken in SOL, USDC or
// USDT and paid into its Jupiter referral fee accounts. NABLA claims 80% of the accrued fees into its Squads treasury; Jupiter
// keeps 20% as its referral program's share.
const REFERRAL_ACCOUNTS = [
  'QCpTWRGm4gu22FobRGTkB1YiSkM8LTPNLq5ZNoEaeew', // Ultra
  'ChTKuXbxwnfjdrYJF5bGNfpkjG8gkA9mcgc5dxaENRZT', // Swap and Trigger
];
// The Ultra referral account's fee token accounts, one per fee mint.
const REFERRAL_FEE_ACCOUNTS = [
  'CGTn6uzGwKL4UDYNrzVTN9uv9dhUJxhYv2Pq83fuwPnF', // wSOL
  '5XjjT65TVYmfziXx5vMi7dsQVx2x22QQ8c7kDAxuF9Cm', // USDC
  '3Kuohe4esars94fejyxUM8cQz2JPeJ5CWAWNHavqBY5x', // USDT
];
const TARGETS = [...REFERRAL_ACCOUNTS, ...REFERRAL_FEE_ACCOUNTS];
const FEE_MINTS = [ADDRESSES.solana.SOL, ADDRESSES.solana.USDC, ADDRESSES.solana.USDT];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  // Moves between NABLA's own accounts would otherwise read as a second receipt of the same fee.
  const received = await getSolanaReceived({ options, targets: TARGETS, mints: FEE_MINTS, blacklists: TARGETS });
  dailyFees.addBalances(received, INTEGRATOR_FEES);
  // Jupiter's referral program keeps 20%; NABLA claims the other 80% into its treasury.
  const dailyRevenue = dailyFees.clone(0.8, INTEGRATOR_FEES);
  const dailySupplySideRevenue = dailyFees.clone(0.2, REFERRAL_FEES);
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Counted from 3 Oct 2026: before it, the team's own load tests and launch checks paid most of the fees.
  start: '2026-10-03',
  fetch,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "The 0.50% fee on every swap made through NABLA, taken in SOL, USDC or USDT and paid into its Jupiter referral fee accounts.",
    UserFees: "Traders pay the 0.50% fee on each swap made through NABLA.",
    Revenue: "NABLA's 80% of the fees, claimed into its treasury.",
    ProtocolRevenue: "NABLA's 80% of the fees, claimed into its treasury.",
    SupplySideRevenue: "Jupiter's 20% of the fees, kept as its referral program's share.",
  },
  breakdownMethodology: {
    Fees: {
      [INTEGRATOR_FEES]: "0.50% integrator fee on swaps routed through Jupiter, paid into NABLA's Jupiter referral fee accounts.",
    },
    UserFees: {
      [INTEGRATOR_FEES]: "0.50% integrator fee paid by traders on each swap made through NABLA.",
    },
    Revenue: {
      [INTEGRATOR_FEES]: "NABLA's 80% share of the integrator fees.",
    },
    ProtocolRevenue: {
      [INTEGRATOR_FEES]: "NABLA's 80% share of the integrator fees, claimed into its treasury.",
    },
    SupplySideRevenue: {
      [REFERRAL_FEES]: "Jupiter's 20% share of the fees, kept by its referral program.",
    },
  },
};

export default adapter;
