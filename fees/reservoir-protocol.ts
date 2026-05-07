import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const RUSD = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const WSRUSD = '0xd3fD63209FA2D55B07A0f6db36C2f43900be3094';
const WSRUSD_OFT_ADAPTER = '0xBb431AbD156B960e5B77cC45c75F107e3991258a';
const SRUSD = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const SAVING_MODULE = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';
const OFT_ADDRESS = '0x4809010926aec940b550D34a46A52739f996D75D';

const WAD = BigInt('1000000000000000000');
const PRICE_SCALE = BigInt('100000000');

const convertToAssetsAbi = 'function convertToAssets(uint256 shares) view returns (uint256)';
const balanceOfAbi = 'function balanceOf(address) view returns (uint256)';

async function prefetch(options: FetchOptions): Promise<any> {
  const [wsrRateFrom, wsrRateTo, priceFrom, priceTo] = await Promise.all([
    options.fromApi.call({ target: WSRUSD, abi: convertToAssetsAbi, params: [WAD.toString()], chain: CHAIN.ETHEREUM }),
    options.toApi.call({ target: WSRUSD, abi: convertToAssetsAbi, params: [WAD.toString()], chain: CHAIN.ETHEREUM }),
    options.fromApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice', chain: CHAIN.ETHEREUM }),
    options.toApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice', chain: CHAIN.ETHEREUM }),
  ]);
  // Return as strings so BigInt precision survives any framework serialisation
  return {
    wsrRateFrom: wsrRateFrom.toString(),
    wsrRateTo: wsrRateTo.toString(),
    priceFrom: priceFrom.toString(),
    priceTo: priceTo.toString(),
  };
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const { wsrRateFrom, wsrRateTo, priceFrom, priceTo } = options.preFetchedResults;
  const wsrRateDelta = BigInt(wsrRateTo) - BigInt(wsrRateFrom);
  const srPriceDelta = BigInt(priceTo) - BigInt(priceFrom);

  const dailyFees = options.createBalances();

  if (options.chain === CHAIN.ETHEREUM) {
    const [wsrSupply, wsrLocked, srSupply] = await Promise.all([
      options.api.call({ target: WSRUSD, abi: 'uint256:totalSupply' }),
      options.api.call({ target: WSRUSD, abi: balanceOfAbi, params: [WSRUSD_OFT_ADAPTER] }),
      options.api.call({ target: SRUSD, abi: 'uint256:totalSupply' }),
    ]);
    const wsrYield = (BigInt(wsrSupply) - BigInt(wsrLocked)) * wsrRateDelta / WAD;
    const srYield = BigInt(srSupply) * srPriceDelta / PRICE_SCALE;
    if (wsrYield !== 0n) dailyFees.add(RUSD, wsrYield, METRIC.ASSETS_YIELDS);
    if (srYield !== 0n) dailyFees.add(RUSD, srYield, METRIC.ASSETS_YIELDS);
  } else {
    const supply = await options.api.call({ target: OFT_ADDRESS, abi: 'uint256:totalSupply' });
    const yield_ = BigInt(supply) * wsrRateDelta / WAD;
    if (yield_ !== 0n) dailyFees.add(RUSD, yield_, METRIC.ASSETS_YIELDS);
  }

  return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees };
}

const methodology = {
  Fees: 'Total yield distributed to wsrUSD and srUSD holders, measured as circulating supply × Δ(exchange rate).',
  Revenue: 'No protocol revenue retained — all yield passes through to holders.',
  SupplySideRevenue: 'Total yield distributed to wsrUSD and srUSD holders.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total yield distributed to wsrUSD and srUSD holders.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Total yield distributed to wsrUSD and srUSD holders.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  prefetch,
  fetch,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2025-04-17' },
    [CHAIN.ARBITRUM]: { start: '2025-05-12' },
    [CHAIN.MONAD]: { start: '2026-01-01' },
  },
  allowNegativeValue: true,
  doublecounted: true,
};

export default adapter;
