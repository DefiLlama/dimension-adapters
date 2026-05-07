import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const RUSD          = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const SAVING_MODULE = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';
const USDC          = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT          = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

// ── ERC4626 positions where protocol holds SHARES in an external vault ───
// yield_i = shares_at_fromBlock × (exchangeRate_end − exchangeRate_start)
// Capital-neutral: new deposits increase shares but not the exchange rate.
// [vault, holder, underlying_token]
const ERC4626: [string, string, string][] = [
  // FundAdapters (Reservoir internal): steakUSDC FundAdapter holds shares of the Morpho vault below
  ['0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB', '0x99A95a9E38e927486fC878f41Ff8b118Eb632b10', USDC], // steakUSDC (via FundAdapter)
  // Morpho
  ['0xBEeFFF209270748ddd194831b3fa287a5386f5bC', '0x841DB2cA7E8A8C2fb06128e8c58AA162de0CfCbC', USDC], // bbqUSDC
  ['0xA0804346780b4c2e3bE118ac957D1DB82F9d7484', '0xb595ba80d38b8e4c9894a6734a1b9a7b198870a2', USDT], // bbqUSDT
  ['0xbeef088055857739C12CD3765F20b7679Def0f51', '0x289C204B35859bFb924B9C0759A4FE80f610671c', USDC], // steakUSDC Prime
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', '0xA100A910A30b745064d7174863B730AD6d92Fe64', USDC], // gtUSDC
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', '0x289C204B35859bFb924B9C0759A4FE80f610671c', USDC], // gtUSDC old
  ['0x8c106EEDAd96553e64287A5A6839c3Cc78afA3D0', '0x289C204B35859bFb924B9C0759A4FE80f610671c', USDC], // gtUSDC V2
  ['0xb576765fB15505433aF24FEe2c0325895C559FB2', '0x289C204B35859bFb924B9C0759A4FE80f610671c', '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8'], // senPYUSDV2
  ['0x6dc58a0fdfc8d694e571dc59b9a52eeea780e6bf', '0x289C204B35859bFb924B9C0759A4FE80f610671c', '0x8292bb45bf1ee4d140127049757c2e0ff06317ed'], // senRLUSDv2
  ['0xd8A6511979D9C5D387c819E9F8ED9F3a5C6c5379', '0x289C204B35859bFb924B9C0759A4FE80f610671c', '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8'], // bbqPYUSD
  ['0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11', '0x289C204B35859bFb924B9C0759A4FE80f610671c', USDT], // skymoneyUSDTsavings
  // Euler
  ['0xe0a80d35bb6618cba260120b279d357978c42bce', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', USDC], // eUSDC-22
  ['0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', USDC], // eUSDC-2
  ['0xba98fc35c9dfd69178ad5dce9fa29c64554783b5', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8'], // ePYUSD-6
  ['0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', '0x8292bb45bf1ee4d140127049757c2e0ff06317ed'], // eRLUSD-7
  ['0x9bD52F2805c6aF014132874124686e7b248c2Cbb', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', USDC], // eUSDC-70
  ['0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', USDC], // eUSDC-80
  ['0x6DFC8ae855FA8Ab7bAbB81aB7c8a6DA7794f60fB', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', RUSD], // erUSD-1
  // Fluid
  ['0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33', '0x289C204B35859bFb924B9C0759A4FE80f610671c', USDC], // fUSDC
  ['0x5C20B550819128074FD538Edf79791733ccEdd18', '0x289C204B35859bFb924B9C0759A4FE80f610671c', USDT], // fUSDT
  ['0x6a29a46e21c730dca1d8b23d637c101cec605c5b', '0x289C204B35859bFb924B9C0759A4FE80f610671c', '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f'], // fGHO
  // InfiniFi
  ['0xDBDC1Ef57537E34680B898E1FEBD3D68c7389bCB', '0x289C204B35859bFb924B9C0759A4FE80f610671c', USDC], // siUSD
  // Cap
  ['0x88887bE419578051FF9F4eb6C858A951921D8888', '0x289C204B35859bFb924B9C0759A4FE80f610671c', USDC], // stcUSD
  // Ethena
  ['0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', '0x5563CDA70F7aA8b6C00C52CB3B9f0f45831a22b1', '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3'], // sUSDe
];

// ── Aave aToken positions (rebasing, balanceOf = underlying equivalent) ──
// Δbalance = yield. Capital-neutral: Aave handles accrual internally.
// [atoken, holder, underlying]
const ATOKENS: [string, string, string][] = [
  ['0xFa82580c16A31D0c1bC632A36F82e83EfEF3Eec0', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', '0x8292bb45bf1ee4d140127049757c2e0ff06317ed'], // aEthRLUSD
  ['0x0C0d01AbF3e6aDfcA0989eBbA9d6e85dD58EaB1E', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8'], // aEthPYUSD
  ['0x7c0477d085ECb607CF8429f3eC91Ae5E1e460F4F', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', '0xD6C7529F53FCd3C85B6E4cc47403d57e8d9EB272'], // aEthUSDG
  ['0xE3190143Eb552456F88464662f0c0C4aC67A77eB', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', '0x8292bb45bf1ee4d140127049757c2e0ff06317ed'], // aHorRwaRLUSD
  ['0x1a88df1cfe15af22b3c4c783d4e6f7f9e0c1885d', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f'], // stkGHO
];

const fetch = async (options: FetchOptions) => {
  const { fromApi, toApi, createBalances } = options;
  const dailyFees              = createBalances();
  const dailySupplySideRevenue = createBalances();

  // ── 1. ERC4626 holder positions: yield = shares × Δ(exchange rate) ──────
  // exchange rate = convertToAssets(1e18) at each block boundary.
  // shares are fixed at fromBlock so new deposits don't inflate the delta.
  const [sharesFrom, ratesFrom, ratesTo] = await Promise.all([
    fromApi.multiCall({ calls: ERC4626.map(([v, h]) => ({ target: v, params: [h] })), abi: 'function balanceOf(address) view returns (uint256)' }),
    fromApi.multiCall({ calls: ERC4626.map(([v])    => ({ target: v, params: ['1000000000000000000'] })), abi: 'function convertToAssets(uint256) view returns (uint256)' }),
    toApi.multiCall({   calls: ERC4626.map(([v])    => ({ target: v, params: ['1000000000000000000'] })), abi: 'function convertToAssets(uint256) view returns (uint256)' }),
  ]);
  ERC4626.forEach(([, , underlying], i) => {
    const shares  = BigInt(sharesFrom[i] ?? 0);
    const rFrom   = BigInt(ratesFrom[i] ?? 0);
    const rTo     = BigInt(ratesTo[i]   ?? 0);
    const yield_i = (shares * (rTo - rFrom)) / BigInt('1000000000000000000');
    if (yield_i !== 0n) dailyFees.add(underlying, yield_i, METRIC.ASSETS_YIELDS);
  });

  // ── 2. Aave aTokens (rebasing — Δbalance = yield) ───────────────────────
  const [aFrom, aTo] = await Promise.all([
    fromApi.multiCall({ calls: ATOKENS.map(([t, h]) => ({ target: t, params: [h] })), abi: 'function balanceOf(address) view returns (uint256)' }),
    toApi.multiCall({   calls: ATOKENS.map(([t, h]) => ({ target: t, params: [h] })), abi: 'function balanceOf(address) view returns (uint256)' }),
  ]);
  ATOKENS.forEach(([, , underlying], i) => {
    const delta = BigInt(aTo[i] ?? 0) - BigInt(aFrom[i] ?? 0);
    if (delta !== 0n) dailyFees.add(underlying, delta, METRIC.ASSETS_YIELDS);
  });

  // ── 3. Supply-side: srUSD holder yield via SavingModule.currentPrice() ──
  // currentPrice() is a continuously-compounding accumulator (1e8 precision).
  // yield = srUSD.totalSupply × Δ(currentPrice) / 1e8
  // Capital-neutral: price only increases from interest, not from new deposits.
  const srusdAddr = await fromApi.call({ target: SAVING_MODULE, abi: 'address:srusd' });
  const [priceFrom, priceTo, srUSDSupply] = await Promise.all([
    fromApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
    toApi.call({   target: SAVING_MODULE, abi: 'uint256:currentPrice' }),
    fromApi.call({ target: srusdAddr,     abi: 'uint256:totalSupply' }),
  ]);
  const holderYield = (BigInt(srUSDSupply) * (BigInt(priceTo) - BigInt(priceFrom))) / BigInt('100000000');
  if (holderYield !== 0n) dailySupplySideRevenue.add(RUSD, holderYield, METRIC.ASSETS_YIELDS);

  return { dailyFees, dailySupplySideRevenue };
};

const methodology = {
  TVL: 'TVL of the protocol is the total outstanding stablecoins minted (rUSD, srUSD, wsrUSD, and trUSD)',
  Fees: 'Total yield earned on the protocol\'s investment portfolio (DeFi vaults + RWA).',
  Revenue: 'Protocol income retained after distributing yield to srUSD/wsrUSD holders.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Gross yield from ERC4626 share price appreciation (shares × Δ exchange rate) and Aave aToken rebase growth across Morpho, Euler, Fluid, and other DeFi positions.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Yield distributed to srUSD holders via the continuously-compounding SavingModule rate (srUSD.totalSupply × Δ currentPrice).',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Protocol income: total fees minus supply-side distributions.',
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
