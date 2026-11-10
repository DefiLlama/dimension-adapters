import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { ABI, DEPLOYMENT_BLOCK, MARKETS, START, USDG } from '../../helpers/hedgehood-options';

async function fetch(options: FetchOptions) {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  // getFromBlock() is already the block after the previous window's closing block, so adjacent pulls do not overlap
  const [firstBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  // A failed lookup returns null: rescanning from deployment would count earlier fills again
  if (!Number.isInteger(firstBlock) || !Number.isInteger(toBlock)) throw new Error('HedgeHood Options: block lookup failed');
  const fromBlock = Math.max(firstBlock, DEPLOYMENT_BLOCK);
  if (fromBlock <= toBlock) {
    const targets = MARKETS.map(({ market }) => market);
    const [fills, premiums] = await Promise.all([
      // One list per market, in MARKETS order, so each fill is valued in its market's stock
      options.getLogs({ targets, eventAbi: ABI.traded, fromBlock, toBlock, flatten: false }),
      options.getLogs({ targets, eventAbi: ABI.premiumSettled, fromBlock, toBlock }),
    ]);
    fills.forEach((marketFills: any[], i: number) => {
      // quantity is in shares of the underlying, 18 decimals like the stock token
      for (const fill of marketFills) dailyNotionalVolume.add(MARKETS[i].underlying, fill.quantity);
    });
    for (const premium of premiums) dailyPremiumVolume.add(USDG, BigInt(premium.sellerGets) + BigInt(premium.fee));
  }
  return { dailyNotionalVolume, dailyPremiumVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: START,
  fetch,
  methodology: {
    NotionalVolume: 'The shares of the underlying stock in each fill (Traded.quantity), valued at the stock token price. Every fill is counted once, whether a taker filled a signed order or two orders were matched.',
    PremiumVolume: 'What the buyer pays in USDG for each fill (PremiumSettled.sellerGets + fee).',
  },
};

export default adapter;
