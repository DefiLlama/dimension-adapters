/**
 * Stratex Protocol - DeFiLlama Dimension Adapter (Fees & Revenue)
 *
 * This adapter tracks fees and revenue for the Stratex Protocol on Base network.
 * It monitors entrance and exit fees collected from vault deposits and withdrawals.
 *
 * Metrics tracked:
 * - dailyFees: Total fees collected in the period
 * - dailyRevenue: Protocol revenue (100% of fees go to protocol treasury)
 * - dailyProtocolRevenue: Same as dailyRevenue (all revenue is protocol-controlled)
 * - dailyUserFees: Fees paid by users (same as dailyFees)
 */

import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// Vault Addresses on Base
const VAULTS = [
  '0xe5f2fe713CDB192C85e67A912Ff8891b4E636614', // stratUSD
  '0x8c0832E8eb8c8Ee08935c6ba660Da4fCB0f89907', // stratUSD_LP
  '0xaE35FF1BC4fBb45AAEef9768A3d9610786cAc98b', // stratETH
  '0x58575aC0ddb3860bc1D79D49738512fF676ecB9a', // stratETH_LP
  '0x9213d24f617dE982dB528c95A701eD1b2AF29cB2', // stratBTC
  '0x2309B44f023103b50F8779656d0adD15137E451E', // stratBTC_LP
];

/**
 * Fetch fees and revenue metrics for a given time period
 */
const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;

  // Create balance objects for different metrics
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  // Fetch FeeAccrued events from all vaults
  // Event signature: FeeAccrued(address token, address user, address receiver, uint256 fee)
  const logs = await getLogs({
    targets: VAULTS,
    eventAbi:
      'event FeeAccrued(address token, address user, address receiver, uint256 fee)',
  });

  // Aggregate fees by token
  logs.forEach((log: any) => {
    const token = log.token;
    const fee = log.fee;

    // Add to daily fees
    dailyFees.add(token, fee);

    // All fees go to protocol treasury (100% revenue)
    dailyRevenue.add(token, fee);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue, // 100% of revenue is protocol revenue
    dailyUserFees: dailyFees, // All fees are paid by users
  };
};

// Export adapter configuration for DeFiLlama dimension-adapters
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-07-09', // Update with actual deployment date
    },
  },
  methodology: {
    Fees: 'Stratex collects entrance fees (0.2%) on deposits and exit fees (0.2%) on withdrawals from ERC4626 vaults. All fees are tracked via FeeAccrued events emitted by vault contracts.',
    Revenue:
      '100% of collected fees are sent to the protocol treasury (feeReceiver). Revenue equals total fees collected.',
    ProtocolRevenue:
      'All revenue is controlled by the protocol treasury and used for protocol operations and development.',
    UserFees:
      'Users pay fees when depositing (entrance fee) or withdrawing (exit fee) from vaults. Fees are collected in the same token as the deposit/withdrawal.',
  },
};

export default adapter;
