import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const RUSD           = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const WSRUSD         = '0xd3fD63209FA2D55B07A0f6db36C2f43900be3094';
const WSRUSD_OFT     = '0x4809010926aec940b550D34a46A52739f996D75D'; // same address on Arbitrum, SEI, Monad
const SRUSD          = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const SAVING_MODULE  = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';

const WAD         = BigInt('1000000000000000000');
const PRICE_SCALE = BigInt('100000000');
const USDC_THRESHOLD = 1_000_000_000_000n; // convertToAssets(1e18) < 1e12 → 6-dec asset vault

const convertToAssetsAbi = 'function convertToAssets(uint256 shares) view returns (uint256)';
const balanceOfAbi       = 'function balanceOf(address) view returns (uint256)';

// All ERC4626 positions the protocol holds on Ethereum: [vault, owner]
// Sources: tokensAndOwners + fund-wrapper vault addresses from projects/reservoir-protocol/index.js
const VAULT_POSITIONS: [string, string][] = [
  // Aave Safety Module
  ['0x1a88df1cfe15af22b3c4c783d4e6f7f9e0c1885d', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // stkGHO
  // Cap
  ['0x88887bE419578051FF9F4eb6C858A951921D8888', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // stcUSD
  // Ethena
  ['0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', '0x5563CDA70F7aA8b6C00C52CB3B9f0f45831a22b1'], // sUSDe
  // Euler
  ['0xe0a80d35bb6618cba260120b279d357978c42bce', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eUSDC-22
  ['0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eUSDC-2
  ['0xba98fc35c9dfd69178ad5dce9fa29c64554783b5', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // ePYUSD-6
  ['0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eRLUSD-7
  ['0x9bD52F2805c6aF014132874124686e7b248c2Cbb', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eUSDC-70
  ['0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eUSDC-80
  ['0x6DFC8ae855FA8Ab7bAbB81aB7c8a6DA7794f60fB', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // erUSD-1
  // Fluid
  ['0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fUSDC
  ['0x5C20B550819128074FD538Edf79791733ccEdd18', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fUSDT
  ['0x6a29a46e21c730dca1d8b23d637c101cec605c5b', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fGHO
  // InfiniFi
  ['0xDBDC1Ef57537E34680B898E1FEBD3D68c7389bCB', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // siUSD
  // Morpho (tokensAndOwners)
  ['0xBEeFFF209270748ddd194831b3fa287a5386f5bC', '0x841DB2cA7E8A8C2fb06128e8c58AA162de0CfCbC'], // bbqUSDC-Smokehouse
  ['0xA0804346780b4c2e3bE118ac957D1DB82F9d7484', '0xb595ba80d38b8e4c9894a6734a1b9a7b198870a2'], // bbqUSDT-Smokehouse
  ['0xbeef088055857739C12CD3765F20b7679Def0f51', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // steakUSDC Prime V2
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', '0xA100A910A30b745064d7174863B730AD6d92Fe64'], // gtUSDC-Gauntlet
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // gtUSDC-Gauntlet-old
  ['0x8c106EEDAd96553e64287A5A6839c3Cc78afA3D0', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // gtUSDC V2
  ['0xb576765fB15505433aF24FEe2c0325895C559FB2', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // senPYUSDV2
  ['0x6dc58a0fdfc8d694e571dc59b9a52eeea780e6bf', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // senRLUSDv2
  ['0xd8A6511979D9C5D387c819E9F8ED9F3a5C6c5379', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // bbqPYUSD
  ['0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // skyUSDT-savings
  // Treehouse
  ['0xA01227A26A7710bc75071286539E47AdB6DEa417', '0x8d3A354f187065e0D4cEcE0C3a5886ac4eBc4903'], // tUSDe
  // Hyperithm
  ['0x777791C4d6DC2CE140D00D2828a7C93503c67777', '0x2adf038b67a8a29cda82f0eceb1ff0dba704b98d'], // hyperUSDC
  // IPOR
  ['0xc197ad72936b7c558c96417f22041fe9e3c7043f', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // ResHY
  // Fund wrappers — each holds shares in its underlying ERC4626 vault
  ['0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB', '0x99A95a9E38e927486fC878f41Ff8b118Eb632b10'], // steakUSDC fund
  ['0xd63070114470f685b75B74D60EEc7c1113d33a3D', '0x99E8903bdEFB9e44cd6A24B7f6F97dDd071549bc'], // USUALUSDC+ fund
  ['0xbeEF346d7099865208Ff331e4f648f4154DDAa05', '0xb82749F316CB9c06F38587aBecF3EB1bC842CC93'], // bbqUSDCreservoir fund
  ['0xbeeff2C5bF38f90e3482a8b19F12E5a6D2FCa757', '0xC5deA68CCe26c014BEC516CDA70c107c534a73C4'], // bbqUSDC-HYI fund
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', '0x86Ac8e29Be5ad83c611fE054Df20970d3b4f9BE0'], // gtUSDC-old2 fund
];

async function prefetch(options: FetchOptions): Promise<any> {
  const balCalls  = VAULT_POSITIONS.map(([v, o]) => ({ target: v, params: [o] }));
  const rateCalls = VAULT_POSITIONS.map(([v])    => ({ target: v, params: [WAD.toString()] }));

  const [wsrRateFrom, wsrRateTo, priceFrom, priceTo, posBalances, posRatesFrom, posRatesTo] = await Promise.all([
    options.fromApi.call({ target: WSRUSD, abi: convertToAssetsAbi, params: [WAD.toString()], chain: CHAIN.ETHEREUM }),
    options.toApi.call({   target: WSRUSD, abi: convertToAssetsAbi, params: [WAD.toString()], chain: CHAIN.ETHEREUM }),
    options.fromApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice', chain: CHAIN.ETHEREUM }),
    options.toApi.call({   target: SAVING_MODULE, abi: 'uint256:currentPrice', chain: CHAIN.ETHEREUM }),
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls,  permitFailure: true, chain: CHAIN.ETHEREUM }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls, permitFailure: true, chain: CHAIN.ETHEREUM }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls, permitFailure: true, chain: CHAIN.ETHEREUM }),
  ]);

  return {
    wsrRateFrom: wsrRateFrom.toString(),
    wsrRateTo:   wsrRateTo.toString(),
    priceFrom:   priceFrom.toString(),
    priceTo:     priceTo.toString(),
    posBalances,
    posRatesFrom,
    posRatesTo,
  };
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const { wsrRateFrom, wsrRateTo, priceFrom, priceTo, posBalances, posRatesFrom, posRatesTo } =
    options.preFetchedResults;

  const wsrRateDelta = BigInt(wsrRateTo) - BigInt(wsrRateFrom);
  const srPriceDelta = BigInt(priceTo)   - BigInt(priceFrom);

  const dailyFees              = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (options.chain === CHAIN.ETHEREUM) {
    // ── Gross Protocol Revenue ───────────────────────────────────────────────
    // Sum ERC4626 yield across every position the protocol holds on Ethereum.
    // yield_i = shares_i × (convertToAssets_end − convertToAssets_start) / WAD
    // 6-dec vaults (USDC/USDT, where convertToAssets(1e18) < 1e12) are scaled
    // to 18-dec before accumulation so all amounts use the same unit as RUSD.
    let posYield = 0n;
    for (let i = 0; i < VAULT_POSITIONS.length; i++) {
      if (!posBalances[i] || !posRatesFrom[i] || !posRatesTo[i]) continue;
      const rateDelta = BigInt(posRatesTo[i]) - BigInt(posRatesFrom[i]);
      if (rateDelta <= 0n) continue;
      let yieldRaw = BigInt(posBalances[i]) * rateDelta / WAD;
      if (BigInt(posRatesFrom[i]) < USDC_THRESHOLD) {
        yieldRaw *= 1_000_000_000_000n; // scale 6-dec asset to 18-dec
      }
      posYield += yieldRaw;
    }
    if (posYield > 0n) dailyFees.add(RUSD, posYield, METRIC.ASSETS_YIELDS);

    // ── Cost of Revenue ──────────────────────────────────────────────────────
    // Yield paid to wsrUSD holders (totalSupply × Δexchange rate) and to
    // srUSD holders (totalSupply × Δprice from SavingModule).
    const [wsrSupply, srSupply] = await Promise.all([
      options.api.call({ target: WSRUSD, abi: 'uint256:totalSupply' }),
      options.api.call({ target: SRUSD,  abi: 'uint256:totalSupply' }),
    ]);
    const wsrTotalYield = BigInt(wsrSupply) * wsrRateDelta / WAD;
    const srYield       = BigInt(srSupply)  * srPriceDelta / PRICE_SCALE;

    if (wsrTotalYield !== 0n) dailySupplySideRevenue.add(RUSD, wsrTotalYield, METRIC.ASSETS_YIELDS);
    if (srYield       !== 0n) dailySupplySideRevenue.add(RUSD, srYield,       METRIC.ASSETS_YIELDS);
  } else {
    // Non-ETH chains: fees = supply = OFT supply × wsrRateDelta.
    // Per-chain revenue = 0; ETH carries the full protocol margin.
    const oftSupply = await options.api.call({ target: WSRUSD_OFT, abi: 'uint256:totalSupply' });
    const oftYield  = BigInt(oftSupply) * wsrRateDelta / WAD;
    if (oftYield !== 0n) {
      dailyFees.add(RUSD, oftYield, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(RUSD, oftYield, METRIC.ASSETS_YIELDS);
    }
  }

  return { dailyFees, dailySupplySideRevenue };
}

const methodology = {
  Fees: 'Gross Protocol Revenue: sum of ERC4626 yield from all on-chain assets held by the protocol (Euler, Morpho, Fluid, InfiniFi, Cap, Ethena, Hyperithm, IPOR, and fund-wrapper vaults). Positions are queried via convertToAssets(1e18) × balanceOf(owner). Off-chain RWA yield (~75–95% of total income) is not capturable on-chain.',
  SupplySideRevenue: 'Cost of Revenue: yield paid to all wsrUSD holders (totalSupply × Δexchange rate) plus srUSD holders (totalSupply × ΔSavingModule price). Uses totalSupply so bridged/locked wsrUSD holders are included.',
  Revenue: 'Gross Profit = Fees − SupplySideRevenue. Negative values reflect that on-chain ERC4626 income is only a fraction of total protocol revenue; the remainder comes from off-chain RWA and is not measured here.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Σ (vault_shares × ΔconvertToAssets / WAD) across all on-chain ERC4626 positions.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'wsrUSD totalSupply × Δexchange rate / WAD + srUSD totalSupply × ΔSavingModule price / PRICE_SCALE.',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'On-chain ERC4626 yield minus yield committed to wsrUSD + srUSD holders.',
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
    [CHAIN.SEI]:      { start: '2025-06-13' },
    [CHAIN.MONAD]:    { start: '2026-01-01' },
  },
  allowNegativeValue: true,
  doublecounted: true,
};

export default adapter;
