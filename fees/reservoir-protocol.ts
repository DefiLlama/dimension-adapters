import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

// ─── Treasury holder addresses (mirrors TVL adapter)
const FUND_A = '0x289C204B35859bFb924B9C0759A4FE80f610671c';
const FUND_B = '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65';
const FUND_C = '0x841DB2cA7E8A8C2fb06128e8c58AA162de0CfCbC';
const FUND_D = '0xA100A910A30b745064d7174863B730AD6d92Fe64';
const FUND_E = '0xb595ba80d38b8e4c9894a6734a1b9a7b198870a2';
const FUND_F = '0x5563CDA70F7aA8b6C00C52CB3B9f0f45831a22b1';
const FUND_G = '0xE94fc572b5E5Abe38F326F7DeDfe4f0Df9851d2A';
const FUND_J = '0x2adf038b67a8a29cda82f0eceb1ff0dba704b98d';

// ─── ERC4626-compatible vault positions: [vault, holder]
// yield = sharesAtStart × (priceAtEnd − priceAtStart) / 1e18
// Using sharesAtStart isolates yield from same-day capital inflows.
const ERC4626_POSITIONS: readonly [string, string][] = [
  // Morpho MetaMorpho
  ['0xBEeFFF209270748ddd194831b3fa287a5386f5bC', FUND_C], // bbqUSDC Smokehouse
  ['0xA0804346780b4c2e3bE118ac957D1DB82F9d7484', FUND_E], // bbqUSDT Smokehouse
  ['0xbeef088055857739C12CD3765F20b7679Def0f51', FUND_A], // steakUSDC Prime Instant V2
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', FUND_D], // gtUSDC Gauntlet
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', FUND_A], // gtUSDC Gauntlet (old holder)
  ['0x8c106EEDAd96553e64287A5A6839c3Cc78afA3D0', FUND_A], // gtUSDC V2
  ['0xb576765fB15505433aF24FEe2c0325895C559FB2', FUND_A], // senPYUSD V2
  ['0x6dc58a0fdfc8d694e571dc59b9a52eeea780e6bf', FUND_A], // senRLUSD V2
  ['0xd8A6511979D9C5D387c819E9F8ED9F3a5C6c5379', FUND_A], // bbqPYUSD
  // Euler v2
  ['0xe0a80d35bb6618cba260120b279d357978c42bce', FUND_B], // eUSDC-22
  ['0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9', FUND_B], // eUSDC-2
  ['0xba98fc35c9dfd69178ad5dce9fa29c64554783b5', FUND_B], // ePYUSD-6
  ['0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2', FUND_B], // eRLUSD-7
  ['0x9bD52F2805c6aF014132874124686e7b248c2Cbb', FUND_B], // eUSDC-70
  ['0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30', FUND_B], // eUSDC-80
  ['0x6DFC8ae855FA8Ab7bAbB81aB7c8a6DA7794f60fB', FUND_B], // erUSD-1
  // Other yield vaults
  ['0x88887bE419578051FF9F4eb6C858A951921D8888', FUND_A], // stcUSD (Cap)
  ['0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', FUND_F], // sUSDe (Ethena)
  ['0xDBDC1Ef57537E34680B898E1FEBD3D68c7389bCB', FUND_A], // siUSD (InfiniFi)
  ['0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33', FUND_A], // fUSDC (Fluid)
  ['0x5C20B550819128074FD538Edf79791733ccEdd18', FUND_A], // fUSDT (Fluid)
  ['0x6a29a46e21c730dca1d8b23d637c101cec605c5b', FUND_A], // fGHO (Fluid)
  ['0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11', FUND_A], // Sky USDT savings
  ['0x5DaAee9EF143faFF495B581e9863570e83F99d31', FUND_G], // S*USDC (Stargate)
  ['0x17BBC9BD51A52aAf4d2CC6652630DaF4fdB358F7', FUND_G], // S*USDT (Stargate)
  ['0xc197ad72936b7c558c96417f22041fe9e3c7043f', FUND_A], // ResHY (IPOR)
  ['0x777791C4d6DC2CE140D00D2828a7C93503c67777', FUND_J], // hyperUSDC (Hyperithm)
];

// ─── Aave v3 aToken positions (rebasing): [aToken, holder]
// aToken balances grow automatically as interest accrues.
// Balance diff approximates yield; may overcount on days with large new deposits.
const ATOKEN_POSITIONS: readonly [string, string][] = [
  ['0xFa82580c16A31D0c1bC632A36F82e83EfEF3Eec0', FUND_B], // aEthRLUSD
  ['0x0C0d01AbF3e6aDfcA0989eBbA9d6e85dD58EaB1E', FUND_B], // aEthPYUSD
  ['0x7c0477d085ECb607CF8429f3eC91Ae5E1e460F4F', FUND_B], // aEthUSDG
];

const fetch = async (options: FetchOptions) => {
  const { fromApi, toApi } = options;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // ── 1. ERC4626 vault positions ──────────────────────────────────────────
  const vaultTargets  = ERC4626_POSITIONS.map(([vault])         => ({ target: vault }));
  const holderCalls   = ERC4626_POSITIONS.map(([vault, holder]) => ({ target: vault, params: [holder] }));
  const priceCallsIn  = ERC4626_POSITIONS.map(([vault])         => ({ target: vault, params: ['1000000000000000000'] }));

  const [vaultUnderlyings, vaultShares, vaultPricesStart, vaultPricesEnd] = await Promise.all([
    fromApi.multiCall({ abi: 'address:asset',                                              calls: vaultTargets,  permitFailure: true }),
    fromApi.multiCall({ abi: 'function balanceOf(address) view returns (uint256)',         calls: holderCalls,   permitFailure: true }),
    fromApi.multiCall({ abi: 'function convertToAssets(uint256) view returns (uint256)',   calls: priceCallsIn,  permitFailure: true }),
    toApi.multiCall(  { abi: 'function convertToAssets(uint256) view returns (uint256)',   calls: priceCallsIn,  permitFailure: true }),
  ]);

  ERC4626_POSITIONS.forEach((_pos, i) => {
    const underlying = vaultUnderlyings[i];
    const shares = BigInt(vaultShares[i] ?? 0);
    const pStart = BigInt(vaultPricesStart[i] ?? 0);
    const pEnd   = BigInt(vaultPricesEnd[i]   ?? 0);
    const delta  = pEnd - pStart;
    if (!underlying || shares === 0n || delta <= 0n) return;
    const yieldAmt = (shares * delta) / BigInt(1e18);
    dailyFees.add(underlying, yieldAmt, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(underlying, yieldAmt, METRIC.ASSETS_YIELDS);
  });

  // ── 2. Aave v3 aToken positions (rebasing) ─────────────────────────────
  const aTokenTargets = ATOKEN_POSITIONS.map(([aToken])         => ({ target: aToken }));
  const aHolderCalls  = ATOKEN_POSITIONS.map(([aToken, holder]) => ({ target: aToken, params: [holder] }));

  const [aUnderlyings, aBalStart, aBalEnd] = await Promise.all([
    fromApi.multiCall({ abi: 'address:UNDERLYING_ASSET_ADDRESS', calls: aTokenTargets, permitFailure: true }),
    fromApi.multiCall({ abi: 'function balanceOf(address) view returns (uint256)',      calls: aHolderCalls,  permitFailure: true }),
    toApi.multiCall(  { abi: 'function balanceOf(address) view returns (uint256)',      calls: aHolderCalls,  permitFailure: true }),
  ]);

  ATOKEN_POSITIONS.forEach((_pos, i) => {
    const underlying = aUnderlyings[i];
    const balStart = BigInt(aBalStart[i] ?? 0);
    const balEnd   = BigInt(aBalEnd[i]   ?? 0);
    const delta    = balEnd - balStart;
    if (!underlying || delta <= 0n) return;
    dailyFees.add(underlying, delta, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(underlying, delta, METRIC.ASSETS_YIELDS);
  });

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
    Fees: 'Yield earned by the protocol treasury from ERC4626 vault positions (Morpho, Euler, Fluid, Cap, Ethena, InfiniFi, Stargate, IPOR, Hyperithm) and Aave v3 aToken rebasing positions held across treasury funds.',
    SupplySideRevenue: 'All yield is reinvested on behalf of rUSD/srUSD holders — none is retained as protocol revenue.',
    Revenue: 'Protocol retains no portion of yield; all earnings flow to token holders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: 'Yield from ERC4626 vault price appreciation (convertToAssets delta × shares held) and Aave aToken rebasing (balance delta).',
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: 'All treasury yield is distributed to rUSD/srUSD holders with no protocol cut.',
    },
  },
};

export default adapter;
