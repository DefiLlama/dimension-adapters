import { CHAIN } from '../../chains';

export const FEE_WALLET = '0xd64a453da8fcdd049697aa5c6dabfff09916c795';

// 1inch AggregationRouterV6. Robinhood has a separate deployment.
// Ethereum: 0xc011117d2f722f5a7068b80d02710673ddf81b1b85cd836a5c603648d1e7863c
// Robinhood: 0x05fac0031d3d88804d0cdd6480d68a159a78d384672545cdbabaf52a1a4cd51d
const CLASSIC_ROUTER = '0x111111125421ca6dc452d289314280a0f8842a65';
const ROBINHOOD_ROUTER = '0x5a705de8982235a7fa45bb83dcacf03a211389c7';

export type EvmRoutes = {
  start: string;
  classic: string;
  okx?: { router: string; start: string };
  kyber?: { router: string; start: string };
  fusion?: { settlement: string; start: string };
};

export const evmRoutes: Record<string, EvmRoutes> = {
  [CHAIN.ETHEREUM]: {
    start: '2025-05-15',
    classic: CLASSIC_ROUTER,
    // 0xa147b3ba61707d30b9cea99cb8973b050afd69164ee3339d47e5d2b197894f6d
    okx: { router: '0x8feab81d36e7576107d5de0758c1b839be31b4f6', start: '2026-08-25' },
    // xStocks fill: 0x04ce421d44814107ca339ea660a6089a1216474e3017c6da1bf2a599d0d4b40e
    fusion: { settlement: '0x399740157391a9f1bf4e9921a8834f9bc8f2678e', start: '2026-03-06' },
  },
  [CHAIN.BSC]: {
    start: '2026-11-16',
    classic: CLASSIC_ROUTER,
    // 0x22976d61a6251eda1703a165ce04b6c78055ac22813467ed6082f7ee9e5b934b
    okx: { router: '0x5994814f2c4040b863a0125a45de152a8c2a4dec', start: '2026-11-16' },
  },
  [CHAIN.BASE]: {
    start: '2025-05-21',
    classic: CLASSIC_ROUTER,
    // 0x76fa7e0296cd8110a46b1c1d3bc49b8746859c388deb78bcb01acd4da3b18fc4
    okx: { router: '0x67d03631fe51b741c0c00c4e16eb662ac84381df', start: '2026-08-25' },
  },
  [CHAIN.OPTIMISM]: {
    start: '2025-05-31',
    classic: CLASSIC_ROUTER,
    // 0x639d7cc2e623d16da4230180550b10a93073eb934fbaa0a5447dbe766a46fc12
    okx: { router: '0x1f5b43127414e36c31ecb5ff5567262997cd24d0', start: '2026-09-25' },
    // 0x89468ae7a024e74c745e8bff1ec2b4f7a5d3bacaab866764db48a18d9d382bed
    kyber: { router: '0x6131b5fae19ea4f9d964eac0408e4408b66337b5', start: '2026-09-22' },
  },
  [CHAIN.ARBITRUM]: { start: '2025-05-30', classic: CLASSIC_ROUTER },
  [CHAIN.POLYGON]: { start: '2026-09-29', classic: CLASSIC_ROUTER },
  [CHAIN.AVAX]: { start: '2026-09-29', classic: CLASSIC_ROUTER },
  [CHAIN.ROBINHOOD]: { start: '2026-09-01', classic: ROBINHOOD_ROUTER },
};

// Ethereum deployments matched to the Backed asset registry and Wallet V's Fusion fills.
// https://api.backed.fi/api/v2/public/assets?page=0
export const fusionXStocks = new Set([
  '0x53ee7f58cf031ea4d897fdfcdafad124b3160689', // SOXLx
  '0x5621737f42dae558b81269fcb9e9e70c19aa6b35', // MSFTx
  '0x68fa48b1c2fe52b3d776e1953e0e782b5044ce28', // SPCXx
  '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0', // TSLAx
  '0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a', // AAPLx
  '0xc1ccf97dcd79e0edeaeb5cd80416ac243a4fbe52', // XBIx
  '0xc845b2894dbddd03858fd2d643b4ef725fe0849d', // NVDAx
  '0xe8ff2d2b9fd5099b70e535a53feb83048cf798f2', // SQQQx
  '0xe92f673ca36c5e2efd2de7628f815f84807e803f', // GOOGLx
]);

export const swapChains = {
  ...Object.fromEntries(Object.entries(evmRoutes).map(([chain, route]) => [chain, { start: route.start }])),
  [CHAIN.SOLANA]: { start: '2025-09-04' },
};

export const bridgeChains: Record<string, { start: string }> = {
  [CHAIN.OPTIMISM]: { start: '2025-07-17' },
  [CHAIN.ETHEREUM]: { start: '2025-07-25' },
};

export const startTimestamp = (date: string) => Date.parse(date) / 1000;
