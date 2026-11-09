import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getCurveTrades, lower, start } from '../helpers/genius-fun';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { byCurve, buys, sells } = await getCurveTrades(options);
  for (const log of buys) {
    // quoteIn is the accepted gross input, excluding any refunded final fill.
    dailyVolume.add(byCurve.get(lower(log.address))!.args.pairToken, log.args.quoteIn);
  }
  for (const log of sells) {
    // quoteOut is net of the fee and creator tax; restore the gross quote leg.
    const grossQuote = BigInt(log.args.quoteOut) + BigInt(log.args.fee) + BigInt(log.args.tax);
    dailyVolume.add(byCurve.get(lower(log.address))!.args.pairToken, grossQuote);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  start,
  fetch,
  methodology: {
    Volume: 'Gross quote-asset volume on Genius.fun bonding curves, counting one leg per trade: accepted quoteIn for buys and quoteOut + fee + tax for sells. Refunds, liquidity migrations, internal buybacks and post-graduation PancakeSwap Infinity trades are excluded.',
  },
};

export default adapter;
