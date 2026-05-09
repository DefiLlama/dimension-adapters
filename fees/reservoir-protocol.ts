import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const RUSD               = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const WSRUSD             = '0xd3fD63209FA2D55B07A0f6db36C2f43900be3094';
const WSRUSD_OFT_ADAPTER = '0xBb431AbD156B960e5B77cC45c75F107e3991258a';
const SRUSD              = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const SAVING_MODULE      = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';
// PSM on Ethereum (Mint/Redeem + totalValue); same address = wsrUSD OFT on other chains
const PSM_OFT            = '0x4809010926aec940b550D34a46A52739f996D75D';

const WAD         = BigInt('1000000000000000000');
const PRICE_SCALE = BigInt('100000000');

const convertToAssetsAbi = 'function convertToAssets(uint256 shares) view returns (uint256)';
const balanceOfAbi       = 'function balanceOf(address) view returns (uint256)';

async function prefetch(options: FetchOptions): Promise<any> {
  const { fromApi, toApi } = options;

  // Exchange rates at window boundaries — used to derive yield per share
  const [wsrRateFrom, wsrRateTo, priceFrom, priceTo] = await Promise.all([
    fromApi.call({ target: WSRUSD,        abi: convertToAssetsAbi, params: [WAD.toString()] }),
    toApi.call({   target: WSRUSD,        abi: convertToAssetsAbi, params: [WAD.toString()] }),
    fromApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
    toApi.call({   target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
  ]);

  return {
    wsrRateFrom: wsrRateFrom.toString(),
    wsrRateTo:   wsrRateTo.toString(),
    priceFrom:   priceFrom.toString(),
    priceTo:     priceTo.toString(),
  };
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const { wsrRateFrom, wsrRateTo, priceFrom, priceTo } = options.preFetchedResults;
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

    // Gross Protocol Revenue = yield on ALL wsrUSD obligations (bridged + circulating) + srUSD.
    // The wsrUSD exchange rate is set by the protocol to reflect total income across all assets
    // (on-chain DeFi vaults and off-chain RWA), so totalSupply × Δrate is the gross income proxy.
    const wsrTotalYield   = BigInt(wsrSupply) * wsrRateDelta / WAD;
    const srYield         = BigInt(srSupply)  * srPriceDelta  / PRICE_SCALE;
    const totalGrossYield = wsrTotalYield + srYield;
    if (totalGrossYield !== 0n) dailyFees.add(RUSD, totalGrossYield, METRIC.ASSETS_YIELDS);

    // Cost of Revenue = yield distributed to CIRCULATING wsrUSD holders on Ethereum + srUSD holders.
    const wsrCircYield = (BigInt(wsrSupply) - BigInt(wsrLocked)) * wsrRateDelta / WAD;
    const supplySide   = wsrCircYield + srYield;
    if (supplySide !== 0n) dailySupplySideRevenue.add(RUSD, supplySide, METRIC.ASSETS_YIELDS);

    // Gross Profit = yield on wsrUSD locked in OFT adapter (backing bridged cross-chain supply).
    const retained = wsrTotalYield - wsrCircYield; // = wsrLocked × wsrRateDelta / WAD
    if (retained !== 0n) dailyRevenue.add(RUSD, retained, METRIC.ASSETS_YIELDS);
  } else {
    // Non-Ethereum chains: supply-side revenue = yield on bridged wsrUSD OFT holders
    const supply = await options.api.call({ target: PSM_OFT, abi: 'uint256:totalSupply' });
    const yield_ = BigInt(supply) * wsrRateDelta / WAD;
    if (yield_ !== 0n) dailySupplySideRevenue.add(RUSD, yield_, METRIC.ASSETS_YIELDS);
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: 'Total yield committed to all wsrUSD and srUSD holders (wsrUSD.totalSupply × Δ(exchange rate) + srUSD.totalSupply × Δ(price)), proxying gross protocol income across on-chain DeFi and off-chain RWA assets.',
  Revenue: 'Yield accruing to wsrUSD locked in the cross-chain OFT adapter — the spread the protocol retains before distributing to bridged-chain holders.',
  SupplySideRevenue: 'Yield distributed to wsrUSD and srUSD holders on each chain (per-chain circulating supply × Δ exchange rate).',
};

const adapter: SimpleAdapter = {
  version: 2,
  prefetch,
  fetch,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2025-04-17' },
    [CHAIN.ARBITRUM]: { start: '2025-05-12' },
    [CHAIN.MONAD]:    { start: '2026-01-01' },
  },
  allowNegativeValue: true,
  doublecounted: true,
};

export default adapter;
