import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const RUSD          = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const WSRUSD        = '0xd3fD63209FA2D55B07A0f6db36C2f43900be3094';
const SRUSD         = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const SAVING_MODULE = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';

const fetch = async (options: FetchOptions) => {
  const { fromApi, toApi, createBalances } = options;
  const dailyFees              = createBalances();
  const dailySupplySideRevenue = createBalances();

  // ── wsrUSD: ERC4626 wrapping RUSD directly ───────────────────────────────
  // yield = totalSupply × Δ(convertToAssets) / 1e18
  // Captures all protocol yield (DeFi vaults + RWA) flowing to wsrUSD holders.
  // Capital-neutral: new deposits increase supply but not the exchange rate.
  const [wsrSupply, wsrRateFrom, wsrRateTo] = await Promise.all([
    fromApi.call({ target: WSRUSD, abi: 'uint256:totalSupply' }),
    fromApi.call({ target: WSRUSD, abi: 'function convertToAssets(uint256) view returns (uint256)', params: ['1000000000000000000'] }),
    toApi.call({   target: WSRUSD, abi: 'function convertToAssets(uint256) view returns (uint256)', params: ['1000000000000000000'] }),
  ]);
  const wsrYield = BigInt(wsrSupply) * (BigInt(wsrRateTo) - BigInt(wsrRateFrom)) / BigInt('1000000000000000000');
  if (wsrYield !== 0n) dailyFees.add(RUSD, wsrYield, METRIC.ASSETS_YIELDS);

  // ── srUSD: yield via SavingModule.currentPrice() ─────────────────────────
  // yield = totalSupply × Δ(currentPrice) / 1e8
  // currentPrice is a 1e8-scaled accumulator; price only increases from interest.
  const [srSupply, priceFrom, priceTo] = await Promise.all([
    fromApi.call({ target: SRUSD,         abi: 'uint256:totalSupply'  }),
    fromApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
    toApi.call({   target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
  ]);
  const srYield = BigInt(srSupply) * (BigInt(priceTo) - BigInt(priceFrom)) / BigInt('100000000');
  if (srYield !== 0n) dailyFees.add(RUSD, srYield, METRIC.ASSETS_YIELDS);

  // Supply-side = all yield distributed to wsrUSD and srUSD holders
  dailySupplySideRevenue.addBalances(dailyFees);

  return { dailyFees, dailySupplySideRevenue };
};

const methodology = {
  TVL: 'TVL of the protocol is the total outstanding stablecoins minted (rUSD, srUSD, wsrUSD, and trUSD)',
  Fees: 'Total yield distributed to wsrUSD and srUSD holders, measured as supply × Δ(exchange rate).',
  Revenue: 'Protocol income retained after distributing yield to wsrUSD/srUSD holders.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'wsrUSD supply × Δ(convertToAssets) captures all protocol yield (DeFi vaults + RWA) flowing to Ethereum wsrUSD holders. srUSD supply × Δ(SavingModule.currentPrice) captures Ethereum srUSD holders.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'All yield distributed to wsrUSD and srUSD holders (same as Fees — protocol passes yield through to stakers).',
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
  doublecounted: true,
};

export default adapter;
