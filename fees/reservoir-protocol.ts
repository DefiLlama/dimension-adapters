import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const RUSD          = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const SRUSD         = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const SAVING_MODULE = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';

const fetch = async (options: FetchOptions) => {
  const { fromApi, toApi } = options;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // srUSD price appreciation captures all yield automatically — DeFi, RWA, and
  // any future strategy — without needing to enumerate individual positions.
  const [priceStart, priceEnd, srUSDSupply] = await Promise.all([
    fromApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
    toApi.call({   target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
    fromApi.call({ target: SRUSD,          abi: 'uint256:totalSupply'  }),
  ]);

  const priceDelta = BigInt(priceEnd) - BigInt(priceStart);
  if (priceDelta > 0n) {
    // currentPrice is 1e8-scaled; totalSupply is 1e18-scaled → result is rUSD wei
    const yieldAmt = (priceDelta * BigInt(srUSDSupply)) / BigInt(1e8);
    dailyFees.add(RUSD, yieldAmt);
    dailySupplySideRevenue.add(RUSD, yieldAmt);
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-07-01',
    },
  },
  methodology: {
    TVL: 'TVL of the protocol is the total outstanding stablecoins minted (rUSD, srUSD, wsrUSD, and trUSD)',
    Fees: 'Total yield and rewards from assets.',
    Revenue: 'Protocol revenue consists of yield generated on assets.',
  },
};

export default adapter;
