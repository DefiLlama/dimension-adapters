import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { ABI, DEPLOYMENT_BLOCK, MARKETS, START, USDG } from '../../helpers/hedgehood-options';

const LABEL = 'Trading fees on option premiums';

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  // getFromBlock() is already the block after the previous window's closing block, so adjacent pulls do not overlap
  const [firstBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  // A failed lookup returns null: rescanning from deployment would count earlier fills again
  if (!Number.isInteger(firstBlock) || !Number.isInteger(toBlock)) throw new Error('HedgeHood Options: block lookup failed');
  const fromBlock = Math.max(firstBlock, DEPLOYMENT_BLOCK);
  if (fromBlock <= toBlock) {
    const premiums = await options.getLogs({ targets: MARKETS.map(({ market }) => market), eventAbi: ABI.premiumSettled, fromBlock, toBlock });
    for (const premium of premiums) dailyFees.add(USDG, BigInt(premium.fee), LABEL);
  }
  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: START,
  fetch,
  methodology: {
    Fees: "The trading fee on each fill's premium (0.05% of the premium, paid by the taker), plus the price improvement kept when two crossing orders are matched. It is credited to the protocol's fee recipient inside the market at the fill (PremiumSettled.fee). The market makers' spread and the options' settlement payouts are not fees.",
    UserFees: 'Same as Fees: paid by the traders.',
    Revenue: 'All trading fees go to the protocol (the FeeSweeper forwards them to the HedgeHood options Safe).',
    ProtocolRevenue: 'All trading fees go to the protocol (the FeeSweeper forwards them to the HedgeHood options Safe).',
  },
  breakdownMethodology: {
    Fees: { [LABEL]: 'PremiumSettled.fee of every fill on the seven markets, in USDG.' },
    UserFees: { [LABEL]: 'PremiumSettled.fee of every fill on the seven markets, in USDG.' },
    Revenue: { [LABEL]: 'The same fee, credited to the protocol fee recipient.' },
    ProtocolRevenue: { [LABEL]: 'The same fee, credited to the protocol fee recipient.' },
  },
};

export default adapter;
