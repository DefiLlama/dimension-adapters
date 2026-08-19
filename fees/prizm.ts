import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getSolanaReceived } from "../helpers/token";

// Jupiter referral token accounts that collect PRIZM's platform fee on routed
// swaps. The fee is taken in the swap's output mint, so there is one account
// per fee mint.
const REFERRAL_FEE_ACCOUNTS = [
  '9knAMZ43uqWTdvA5uovwmiG2J35eBUv587E3LBqTLuJe', // USDC
  'FTPd3H8nmksH29jZnvSCGBkssx7DKMDVF831BqGmF5aD', // wSOL
];

// Wallet that collects PRIZM's fee on staking, lending and liquidity actions.
// Those fees are SPL transfers carved off in the same transaction, landing in
// the wallet's associated token accounts, so both the wallet and its token
// accounts are tracked.
const FEE_WALLET = '9HyCfCB4nHbquYSCLcEXn7KdihnpZHg1DemjVFwV5JR6';
const FEE_WALLET_TOKEN_ACCOUNTS = [
  '2B184UPHLyRmwDttEYtGso3776QYU4HLPaTaKGAfDW7V',
  '3t64KCUaEzvYkBN7wCr2Ao5NSV6mv11DrkBWQo6kxjFM',
  'CUSNYqTXhuJXMmRLLtN4jQz2aixHMUDETnKCXFirL9oy', // USDC
  'EKBVQUpkFKqG5uHkcTViye8WtkhgemMYybW3GyJW8ssm',
  'F9NRjuVBhj4gCVmLcNSJPCLGPu9eGFGRYdDwToxXEAWL', // JitoSOL
  'FfJDdTQbUFUkAitHmSbXnxkUWvTjrKgmjayWfPMjwzHd',
  'JE4P7irArRLokggXff84L5ZYJnqUVqE1aCYs57vGFetv',
];

const TARGETS = [...REFERRAL_FEE_ACCOUNTS, FEE_WALLET, ...FEE_WALLET_TOKEN_ACCOUNTS];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  // Referral-account claims and sweeps between PRIZM's own accounts would
  // otherwise show up as a second receive of the same fee.
  const blacklists = TARGETS;

  const swapFees = await getSolanaReceived({ options, targets: REFERRAL_FEE_ACCOUNTS, blacklists });
  const actionFees = await getSolanaReceived({
    options,
    targets: [FEE_WALLET, ...FEE_WALLET_TOKEN_ACCOUNTS],
    blacklists,
  });

  dailyFees.addBalances(swapFees, METRIC.SWAP_FEES);
  dailyFees.addBalances(actionFees, METRIC.SERVICE_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  start: '2026-08-08',
  fetch,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Platform fees paid by PRIZM users: 0.85% on swaps routed through Jupiter, collected in the output mint via Jupiter referral fee accounts, and 0.33% on staking, lending and liquidity actions, transferred to the PRIZM fee wallet atomically with the action.',
    Revenue: 'All platform fees (0.85% on swaps + 0.33% on staking, lending and liquidity actions) accrue to the protocol; there are no referral or cashback payouts.',
    ProtocolRevenue: 'All platform fees (0.85% on swaps + 0.33% on staking, lending and liquidity actions) accrue to the protocol.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: '0.85% platform fee on swaps routed through Jupiter, collected in the swap output mint via Jupiter referral fee accounts.',
      [METRIC.SERVICE_FEES]: '0.33% platform fee on staking, lending and liquidity actions, transferred to the PRIZM fee wallet atomically with the action.',
    },
    Revenue: {
      [METRIC.SWAP_FEES]: 'All swap platform fees accrue to the protocol.',
      [METRIC.SERVICE_FEES]: 'All staking, lending and liquidity platform fees accrue to the protocol.',
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: 'All swap platform fees accrue to the protocol.',
      [METRIC.SERVICE_FEES]: 'All staking, lending and liquidity platform fees accrue to the protocol.',
    },
  },
};

export default adapter;
