import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

/**
 * Reservoir Protocol Fee Adapter
 *
 * Reservoir is a CDP-based stablecoin protocol.
 * Revenue exists economically (redemption fee burn and asset/liability spread),
 * but there is no explicit on-chain fee accounting or treasury inflow.
 *
 * As fees are not trackable on-chain, this adapter returns zero.
 *
 * TODO: Enable fee tracking if/when the protocol exposes an explicit
 *       on-chain fee or surplus accounting variable (e.g. protocolSurplus,
 *       accruedFees, or a fee collector).
 */

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Reservoir does not expose an explicit on-chain fee collection mechanism. Fees such as redemption burns and balance-sheet spread are not directly measurable.',
  Revenue:
    'Protocol revenue exists economically but is not represented by a dedicated on-chain accounting variable or treasury inflow.',
  ProtocolRevenue:
    'Same as Revenue. All protocol value accrues implicitly and is not directly observable on-chain.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-01-01',
    },
  },
  methodology,
};

export default adapter;
