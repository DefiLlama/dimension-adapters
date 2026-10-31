import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { ESCROW, windowBounds } from '../../helpers/valantis';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances(), dailySupplySideRevenue = options.createBalances();
  const bounds = await windowBounds(options);
  const logs = await options.getLogs({
    target: ESCROW,
    eventAbi: 'event RewardsFunded(uint256 amountHype,uint256 receivedRawShares,uint256 scheduledRawShares,uint64 start,uint64 end,(uint256 activeRawShares,uint256 totalOwnershipUnits,uint256 requestedRawShares,uint256 rewardRawShares) accounting)',
    onlyArgs: false,
  });
  for (const log of logs.filter(bounds.includes)) {
    // New HYPE funding only, not scheduledRawShares (which can reschedule old
    // reserves), base stHYPE rebases, principal deposits, or stream releases.
    const amount = BigInt(log.args.amountHype).toString();
    dailyFees.addGasToken(amount, 'Funded HYPE Premiums');
    dailySupplySideRevenue.addGasToken(amount, 'Funded HYPE Premiums To Restakers');
  }
  return { dailyFees, dailySupplySideRevenue, dailyRevenue: options.createBalances(), dailyProtocolRevenue: options.createBalances() };
};

const adapter: SimpleAdapter = {
  // First RewardsFunded: block 48545658, 2026-10-14T19:35:00Z.
  version: 2, pullHourly: true, chains: [CHAIN.HYPERLIQUID], start: '2026-10-14', fetch,
  methodology: {
    Fees: 'New native HYPE premiums committed to the restaking escrow on the funding date; not independently verified private-deal earnings.',
    Revenue: 'No premium funding is retained as an escrow protocol fee; funded HYPE is allocated to restakers.',
    ProtocolRevenue: 'No premium funding is retained by the escrow as protocol revenue.',
    SupplySideRevenue: 'New funded HYPE premiums allocated to restakers, counted once at funding rather than again on stream release.',
  },
  breakdownMethodology: {
    Fees: { 'Funded HYPE Premiums': 'RewardsFunded.amountHype, excluding recycled share reserves and principal.' },
    SupplySideRevenue: { 'Funded HYPE Premiums To Restakers': 'All new premium funding is allocated to restakers; release timing is reflected in APY.' },
  },
};
export default adapter;
