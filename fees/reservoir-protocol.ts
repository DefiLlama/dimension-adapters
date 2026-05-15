import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const RUSD = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const WSRUSD = '0xd3fD63209FA2D55B07A0f6db36C2f43900be3094';
const WSRUSD_OFT_ADAPTER = '0xBb431AbD156B960e5B77cC45c75F107e3991258a';
const WSRUSD_OFT = '0x4809010926aec940b550D34a46A52739f996D75D'; // wsrUSD OFT — same address on Arbitrum, SEI, Monad
const SRUSD = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const SAVING_MODULE = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';

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
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (options.chain === CHAIN.ETHEREUM) {
    const [wsrSupply, wsrLocked, srSupply] = await Promise.all([
      options.api.call({ target: WSRUSD, abi: 'uint256:totalSupply' }),
      options.api.call({ target: WSRUSD, abi: balanceOfAbi, params: [WSRUSD_OFT_ADAPTER] }),
      options.api.call({ target: SRUSD, abi: 'uint256:totalSupply' }),
    ]);

    const wsrTotal = BigInt(wsrSupply);
    const wsrLocked_ = BigInt(wsrLocked);
    const wsrCirc = wsrTotal - wsrLocked_;
    const srYield = BigInt(srSupply) * srPriceDelta / PRICE_SCALE;
    const wsrTotalYield = wsrTotal * wsrRateDelta / WAD;
    const wsrCircYield = wsrCirc * wsrRateDelta / WAD;

    if (wsrTotalYield !== 0n) dailyFees.add(RUSD, wsrTotalYield, METRIC.ASSETS_YIELDS);
    if (srYield !== 0n) dailyFees.add(RUSD, srYield, METRIC.ASSETS_YIELDS);

    if (wsrCircYield !== 0n) dailySupplySideRevenue.add(RUSD, wsrCircYield, METRIC.ASSETS_YIELDS);
    if (srYield !== 0n) dailySupplySideRevenue.add(RUSD, srYield, METRIC.ASSETS_YIELDS);
  } else {
    // Non-ETH chains: report OFT supply yield so bridged holders are counted per chain.
    // wsrCirc_ETH + sum(OFT supplies) ≈ wsrTotal, so aggregate supply ≈ fees (revenue ≈ 0).
    const oftSupply = await options.api.call({ target: WSRUSD_OFT, abi: 'uint256:totalSupply' });
    const oftYield = BigInt(oftSupply) * wsrRateDelta / WAD;
    if (oftYield !== 0n) dailySupplySideRevenue.add(RUSD, oftYield, METRIC.ASSETS_YIELDS);
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: 'Gross yield committed to all wsrUSD holders (total supply × Δexchange rate) plus srUSD holders — settled on-chain yield proxy; off-chain RWA yield settles with a lag.',
  Revenue: 'Protocol gross profit is not directly observable on-chain; the wsrUSD rate reflects only yield committed to token holders, not total asset yield.',
  SupplySideRevenue: 'Yield paid to wsrUSD holders per chain (circulating on ETH + OFT supply on bridged chains) plus srUSD holders. Bridge is balanced: wsrLocked ≈ sum of OFT supplies.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total yield committed to wsrUSD and srUSD holders.',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Not observable on-chain; protocol retained margin flows through off-chain RWA arrangements.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Per-chain yield distributed to wsrUSD holders (ETH circ + bridged OFT) and srUSD holders.',
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
    [CHAIN.SEI]: { start: '2025-06-13' },
    [CHAIN.MONAD]: { start: '2026-01-01' },
  },
  allowNegativeValue: true,
  doublecounted: true,
};

export default adapter;
