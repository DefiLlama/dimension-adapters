import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const ESCROW = '0x0447d0339c82a8EFe01994b7D1981bf5c517da0e';
const rewardsFundedEvent = 'event RewardsFunded(uint256 amountHype,uint256 receivedRawShares,uint256 scheduledRawShares,uint64 start,uint64 end,(uint256 activeRawShares,uint256 totalOwnershipUnits,uint256 requestedRawShares,uint256 rewardRawShares) accounting)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({ target: ESCROW, eventAbi: rewardsFundedEvent });
  // amountHype is new HYPE only; scheduledRawShares can re-schedule reserves that were already counted
  logs.forEach(log => dailyFees.addGasToken(log.amountHype, 'Funded HYPE Premiums'));
  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees.clone(1, 'Funded HYPE Premiums To Restakers'),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2026-10-14', // first RewardsFunded, block 48545658
  methodology: {
    Fees: 'HYPE premiums funded into the stHYPE restaking escrow, counted when funded.',
    Revenue: 'The escrow keeps no fee; all funded premiums go to restakers.',
    ProtocolRevenue: 'The escrow keeps no fee; all funded premiums go to restakers.',
    SupplySideRevenue: 'HYPE premiums funded into the escrow and paid out to restakers.',
  },
  breakdownMethodology: {
    Fees: { 'Funded HYPE Premiums': 'New HYPE premiums funded into the restaking escrow.' },
    SupplySideRevenue: { 'Funded HYPE Premiums To Restakers': 'Funded HYPE premiums streamed to restakers.' },
  },
};

export default adapter;
