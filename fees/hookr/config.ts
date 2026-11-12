// Deployment manifest and verified contracts: https://github.com/Hookr-fun/hookr-contracts
// Legacy deployments: https://hookr.fun/docs/previous-releases
export const NATIVE = '0x0000000000000000000000000000000000000000';

export const DEAD = '0x000000000000000000000000000000000000dead';

export const SOURCE =
  'https://github.com/Hookr-fun/hookr-contracts/tree/3021ef6ae227164a9460d3a7b96e540df3e74633';

// Verified deployment receipts (registry: 0x5e27da36...; root: 0x042e3b06...) and release records.
// These bound discovery scans; they do not replace the listing's first-activity date.
export const BLOCK = {
  registry: 82269732,
  root: 82270270,
  modular: 57319489,
  oldTokenizer: 92671598,
  newTokenizer: 107699158,
  jar: 102155576,
  split: 102155618,
};

export const CONTRACT = {
  hookr: '0x18e674231a58c239dc7daedcffe15ec3a24cff5c',
  usdg: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
  weth: '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
  root: '0x89c9fb50d1f03192230ffb1c279bb6e7d3fe6acc',
  registry: '0x463c82bea1a52f4cc05ca0741a24f0ad24ba4602',
  treasury: '0x2242f7fc75606500503075f29ea8cda684efb4a9',
  safe: '0x8fdfaa25e2e4dda297f301ea06458f22186d6be9',
  split: '0xe50df7069cac7b4f1ca63d79d26940dba35e5abb',
  jar: '0xb4c20b8245440a3c489991a01a306d33b09047ca',
  releaser: '0xd4a9faaaabf5baf38390852627bd980782d83e75',
  oldTokenizer: '0xfb3c1501c727f30883cd7b36ec380381af7412ef',
  oldLegCollector: '0x7d79010cf29e548b55224f0ceedaed2275d65781',
  newTokenizer: '0x08de138e558a9258c6b4077e8bdeb9ad1fb46a4b',
  newLegCollector: '0x2b8dd989d34256b7685e3bd8f10299a4891f1af2',
  legacyBurner: '0x8cee20fa000af3266ac2cd2cbeefbcd19d98fd89',
  openzapsCampaign2: '0xb5f7d9d4269c897df70df26f7ba48c0d933be8db',
  openzapsCampaign3: '0xc6e444f170259a18b444821db4202d97b4136536',
  openzapsFeeVault: '0x31d6787b7c2c347ffb5b58171e33e9c5132a7338',
  currentWthExecutor: '0x4b4c16681401454140a9dbca55e5c186bbe8d728',
  legacyWthExecutor: '0xc356cf51134e0df02bfe880115dd8c66ead45803',
  poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
  stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
  v2Registry: '0x5b7f1a117a83aaac15b0698aa4eb9d53fe5f5ba3',
  mechanics: '0xd700492b504ba5a72d7de28dde11cd7985a7f1ae',
  legacyHook: '0xe7c3461a4c762ff9db4f91bee3cf8deaafc2e8cc',
  launcher: '0x1cf2748a6670572425eabf9ab9e5bc4eb2eb8ef4',
  rootFactory: '0xa6c2a401597301dff57a59bc8f70a9622499f3ec',
  liquidityVault: '0xa408923ef811945ef119bc700b1950dab65467fc',
};

// Generation 3 and 4 return the same launch struct. Generation 5 uses the auction struct.
const LEGACY_HOOK_PARAMETERS =
  '(uint32 guardBlocks, uint16 maxBuyBps, uint24 snipeTaxPips, uint24 baseFeePips, uint24 maxFeePips,' +
  ' uint16 surgeSens, uint16 burnBps, uint96 burnTriggerWei, uint16 lpBps, uint16 potBps,' +
  ' uint32 potEveryNBuys, uint96 potMinBuyWei) hookParams';
const CURVE_LAUNCH_VIEW =
  'function getLaunch(address token) view returns ((address token, address creator, uint40 launchBlock,' +
  ' uint32 blueprintId, bool graduated, uint96 basePriceWei, uint96 targetWei, uint96 reserveWei,' +
  ' uint128 soldTokens, uint40 graduatedAtBlock, uint160 sqrtPriceX96AtGraduation, bytes32 poolId, ' +
  LEGACY_HOOK_PARAMETERS +
  '))';
const AUCTION_LAUNCH_VIEW =
  'function getLaunch(address token) view returns ((address token, address creator, uint40 launchBlock,' +
  ' uint32 blueprintId, uint8 mode, uint8 status, uint96 openPriceWei, uint96 openFdvWei, uint16 reserveBps,' +
  ' address auction, uint40 auctionEndBlock, uint40 migratedAtBlock, uint160 sqrtPriceX96AtOpen,' +
  ' bytes32 poolId, uint8 quote, ' +
  LEGACY_HOOK_PARAMETERS +
  '))';
const CURVE_LAUNCHED =
  'event TokenLaunched(address indexed token, address indexed creator, uint32 indexed blueprintId,' +
  ' string name, string symbol, string tagline, string logoURI, uint96 targetWei, uint96 basePriceWei)';

export const LEGACY = [
  {
    generation: 3,
    address: '0xaaed6fab06d53311220f35421dda5cc6d6e9d6c3',
    block: 27763919,
    getLaunch: CURVE_LAUNCH_VIEW,
    launched: CURVE_LAUNCHED,
  },
  {
    generation: 4,
    address: '0x5ce779d23d2e99d322004f203813389b6a426e3b',
    block: 33485079,
    getLaunch: CURVE_LAUNCH_VIEW,
    launched: CURVE_LAUNCHED,
  },
  {
    generation: 5,
    address: '0xa043cabe645636899dde91cce4693c00a015e660',
    block: 41850162,
    getLaunch: AUCTION_LAUNCH_VIEW,
    launched:
      'event TokenLaunched(address indexed token, address indexed creator, uint32 indexed blueprintId,' +
      ' uint8 mode, string name, string symbol, string tagline, string logoURI)',
  },
];

export type LegacyLaunchpad = (typeof LEGACY)[number];

// Frozen, superseded root deployments from the historical release manifest.
export const OLD_ROOTS = [
  '0xb3ca29cf721380cee8b8e4755f3865ebc68fe8cc',
  '0xb914f955294799de4b891bd2ea8af628fa1c68cc',
  '0xc7c516cd5546bcb2592fe3f8aa91c2a4ba3768cc',
  '0xa99902a2922014bbe2bf2dcf15742ac5104828cc',
  '0xe5429db8f63912e632e86733905667aaeb6ea8cc',
];

// Integration executors confirmed by Hookr root correction receipts and fees/what-the-hook.ts.
// Their source is unpublished: these ABI definitions are independently reconciled events, not verified source.
export const EXECUTORS = [
  '0x4b4c16681401454140a9dbca55e5c186bbe8d728',
  '0xc356cf51134e0df02bfe880115dd8c66ead45803',
];

// Historical ArbitrageProfitSplit emitters also maintained in fees/what-the-hook.ts (SPLIT_EMITTERS).
// The September 11/12 pilots predate the long-lived integration; keep them for complete backfills.
// The executor source is unpublished; every split is matched to a trusted Hookr root's receipt.
export const LEGACY_EXECUTORS = [
  CONTRACT.legacyWthExecutor,
  '0x8d18dddedd529b7f9d90e65e75408ba2290ab276', // September 11, 2026; root receipt 0xaf5d57ae...f0ca2.
  '0x45dce9f6e01478dc2d5edcf093eae0c0adb043bc', // September 12, 2026.
  '0x4650eeeb8093de5412246a4fbd7d08798fd0ec22', // Integration executor listed by WTH; no observed splits yet.
];

// Hookless ETH/HOOKR market independently identified in all 303 reviewed OpenZaps buybacks.
export const BUYBACK_POOL = '0x590dcb6a87828bf688b48089a62239b693378f1fb64d2286e6a399ed8c005fdf';
