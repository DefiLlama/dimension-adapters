import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';
import * as sdk from "@defillama/sdk";

const RUSD               = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const WSRUSD             = '0xd3fD63209FA2D55B07A0f6db36C2f43900be3094';
const WSRUSD_OFT_ADAPTER = '0xBb431AbD156B960e5B77cC45c75F107e3991258a';
const SRUSD              = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const SAVING_MODULE      = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';
// PSM on Ethereum; same address = wsrUSD OFT on non-Ethereum chains
const PSM_OFT            = '0x4809010926aec940b550D34a46A52739f996D75D';

const WAD         = BigInt('1000000000000000000');
const PRICE_SCALE = BigInt('100000000');

const convertToAssetsAbi = 'function convertToAssets(uint256 shares) view returns (uint256)';
const balanceOfAbi       = 'function balanceOf(address) view returns (uint256)';

async function prefetch(options: FetchOptions): Promise<any> {
  const { fromApi, toApi } = options;

  // Pin to CHAIN.ETHEREUM explicitly — these contracts are Ethereum-only.
  const [wsrRateFrom, wsrRateTo, priceFrom, priceTo] = await Promise.all([
    fromApi.call({ chain: CHAIN.ETHEREUM, target: WSRUSD,        abi: convertToAssetsAbi, params: [WAD.toString()] }),
    toApi.call({   chain: CHAIN.ETHEREUM, target: WSRUSD,        abi: convertToAssetsAbi, params: [WAD.toString()] }),
    fromApi.call({ chain: CHAIN.ETHEREUM, target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
    toApi.call({   chain: CHAIN.ETHEREUM, target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
  ]);

  // Sum bridged wsrUSD OFT supply across all non-Ethereum chains so that
  // Ethereum-side revenue can be netted to avoid double-counting with the
  // per-chain supply-side revenue reported below.
  const arbApi = new sdk.ChainApi({ chain: CHAIN.ARBITRUM, timestamp: options.toTimestamp });
  const monApi = new sdk.ChainApi({ chain: CHAIN.MONAD,    timestamp: options.toTimestamp });
  await Promise.allSettled([arbApi.getBlock(), monApi.getBlock()]);
  const [wsrArbRes, wsrMonRes] = await Promise.allSettled([
    arbApi.call({ target: PSM_OFT, abi: 'uint256:totalSupply' }),
    monApi.call({ target: PSM_OFT, abi: 'uint256:totalSupply' }),
  ]);
  const wsrArbSupply = wsrArbRes.status === 'fulfilled' ? wsrArbRes.value : '0';
  const wsrMonSupply = wsrMonRes.status === 'fulfilled' ? wsrMonRes.value : '0';

  return {
    wsrRateFrom:      wsrRateFrom.toString(),
    wsrRateTo:        wsrRateTo.toString(),
    priceFrom:        priceFrom.toString(),
    priceTo:          priceTo.toString(),
    wsrBridgedSupply: (BigInt(wsrArbSupply || '0') + BigInt(wsrMonSupply || '0')).toString(),
  };
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const { wsrRateFrom, wsrRateTo, priceFrom, priceTo, wsrBridgedSupply } = options.preFetchedResults;
  const wsrRateDelta = BigInt(wsrRateTo) - BigInt(wsrRateFrom);
  const srPriceDelta = BigInt(priceTo)   - BigInt(priceFrom);

  const dailyFees              = options.createBalances();
  const dailyRevenue           = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (options.chain === CHAIN.ETHEREUM) {
    const [wsrSupply, wsrLocked, srSupply] = await Promise.all([
      options.api.call({ target: WSRUSD, abi: 'uint256:totalSupply' }),
      options.api.call({ target: WSRUSD, abi: balanceOfAbi, params: [WSRUSD_OFT_ADAPTER] }),
      options.api.call({ target: SRUSD,  abi: 'uint256:totalSupply' }),
    ]);

    // Gross Protocol Revenue = total yield committed to ALL wsrUSD + srUSD holders.
    // The wsrUSD exchange rate reflects total protocol earnings (on-chain DeFi + off-chain RWA).
    const wsrTotalYield   = BigInt(wsrSupply) * wsrRateDelta / WAD;
    const srYield         = BigInt(srSupply)  * srPriceDelta  / PRICE_SCALE;
    const totalGrossYield = wsrTotalYield + srYield;
    if (totalGrossYield !== 0n) dailyFees.add(RUSD, totalGrossYield, METRIC.ASSETS_YIELDS);

    // Cost of Revenue = yield distributed to CIRCULATING wsrUSD holders on Ethereum + srUSD holders.
    const wsrCircYield = (BigInt(wsrSupply) - BigInt(wsrLocked)) * wsrRateDelta / WAD;
    const supplySide   = wsrCircYield + srYield;
    if (supplySide !== 0n) dailySupplySideRevenue.add(RUSD, supplySide, METRIC.ASSETS_YIELDS);

    // Gross Profit = yield on wsrUSD locked in OFT adapter that is NOT distributed as
    // supply-side revenue on any non-Ethereum chain. Nets out wsrArb + wsrMon so that
    // fees = revenue + Σ(supply_side per chain) holds at the aggregate level.
    const wsrProtocolYield = (BigInt(wsrLocked) - BigInt(wsrBridgedSupply)) * wsrRateDelta / WAD;
    if (wsrProtocolYield !== 0n) dailyRevenue.add(RUSD, wsrProtocolYield, METRIC.ASSETS_YIELDS);
  } else {
    // Non-Ethereum chains: supply-side revenue = yield on bridged wsrUSD OFT supply.
    const supply = await options.api.call({ target: PSM_OFT, abi: 'uint256:totalSupply' });
    const yield_ = BigInt(supply) * wsrRateDelta / WAD;
    if (yield_ !== 0n) dailySupplySideRevenue.add(RUSD, yield_, METRIC.ASSETS_YIELDS);
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: 'Total yield committed to all wsrUSD and srUSD holders (wsrUSD.totalSupply × Δ(exchange rate) + srUSD.totalSupply × Δ(price)), proxying gross protocol income across on-chain DeFi and off-chain RWA assets.',
  Revenue: 'Yield on wsrUSD locked in the OFT adapter that is not distributed on any non-Ethereum chain — the net protocol-retained spread after accounting for all cross-chain pass-throughs.',
  SupplySideRevenue: 'Yield distributed to wsrUSD and srUSD holders on each chain (per-chain circulating supply × Δ exchange rate).',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total yield committed to all wsrUSD and srUSD holders',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Yield on wsrUSD locked in OFT adapter net of cross-chain distributions',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Yield distributed to wsrUSD and srUSD holders per chain',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  prefetch,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2025-04-17' },
    [CHAIN.ARBITRUM]: { start: '2025-05-12' },
    [CHAIN.MONAD]:    { start: '2026-01-01' },
  },
  allowNegativeValue: true,
  doublecounted: true,
};

export default adapter;
