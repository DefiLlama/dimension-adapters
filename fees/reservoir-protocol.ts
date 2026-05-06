import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const RUSD = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const SRUSD = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const SAVING_MODULE = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';

const fetch = async (options: FetchOptions) => {
  const { fromApi, toApi } = options;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // srUSD price appreciation captures all yield automatically — DeFi, RWA, and
  // any future strategy — without needing to enumerate individual positions.
  const [priceStart, priceEnd, srUSDSupply] = await Promise.all([
    fromApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
    toApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
    fromApi.call({ target: SRUSD, abi: 'uint256:totalSupply' }),
  ]);

  const priceDelta = BigInt(priceEnd) - BigInt(priceStart);
  const yieldAmt = (priceDelta * BigInt(srUSDSupply)) / BigInt(1e8);

  dailyFees.add(RUSD, yieldAmt);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue: dailyFees };
};

const methodology = {
  Fees: 'Total yield calculated from srUSD price appreciation.',
  Revenue: 'No revenue',
  SupplySideRevenue: 'Total yield calculated from srUSD price appreciation.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total yield calculated from srUSD price appreciation.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Total yield calculated from srUSD price appreciation.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: '2024-07-01',
  chains: [CHAIN.ETHEREUM],
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
  doublecounted: true, // yields are from other defi protocols
};

export default adapter;
