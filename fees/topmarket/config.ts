// Mainnet inventory and verified sources. Statistics include real activity from deployment:
// https://github.com/top-market-git/topmarket-contracts/blob/021007f929c19918be5c4b4d3c9031bfe501086e/docs/主网配置.md
// https://basescan.org/address/0xf20658ec88403e9a26d77fb95e91c1248d9818ea#code
export const MARKET = '0xf20658ec88403e9a26d77fb95e91c1248d9818ea';
export const MARKET_BLOCK = 50635450;
export const BOX_FACTORY = '0x0e218eddfed2b6e482d2989d05c6db0ee41db2f2';
export const BOX_FACTORY_BLOCK = 50636771;
export const BEACON = '0x7f9b6abff3eab34cc1f3e723798e54d67977a4a7';
export const BEACON_BLOCK = 50636694;
export const NFT_FACTORY = '0xc52ba584399b928f4f1b271b7022243a6de60d5a';
export const NFT_FACTORY_BLOCK = 50634880;
// Nonstandard card boxes use a separate beacon/factory and TokenStakingPool.
// https://basescan.org/tx/0xaa7912a04023cd59172c4e32e418afe78fe168628d881a96908a1c274a10ea69
export const TOKEN_BOX_FACTORY = '0x8f142f5bbc4061df7c84b4990ce9081e4acd4abf';
export const TOKEN_FACTORY_VERSION = '0xb770dc0c6d46b76a8c7c3db0cf2d101a82c7a7d1';
export const TOKEN_BEACON = '0x9cac2ee1ae5ebef1b3a180404ea2d0951c7b416e';
export const TOKEN_BEACON_BLOCK = 52098187;
export const TOKEN_POOL = '0x28b6d82ce27ca6be2c343c593eec44075ebc797d';
export const TOKEN_POOL_BLOCK = 52098071;
export const TOKEN_POOL_VERSION = '0xed069a10e0ad519c09a85ef74b731cde9eccc454';
// Both exact-match sources have identical payment/refund/settlement arithmetic.
export const TOKEN_BOX_VERSIONS = new Set([
  '0x2f2c7fbc60655c1a84ad04bdb0c95c6be6451421',
  '0x60cd098b6ae76591c6391add2d3cbca21fb65f34',
]);
export const TREASURY = '0x0f8dbbd0838eecf6b109c0947da4141ded0fcbab';
export const ASSET_SAFE = '0x394d3f699e0082fe9c4970f0e3c2de248ea21eed';
// Project-confirmed platform inventory and treasury wallets. Entitlement follows
// the recorded historical staker, including stakeFor's beneficiary, not its sender
// or NFT-source custodian. A payout to a platform staker is an internal allocation,
// not an external supplier cost. See the corresponding stake round and payment:
// https://basescan.org/tx/0x441bdc6f495dde7063f8a22eb8d1e94b3a4fb7d912b0862e1b6dd66e864fe940
export const PROTOCOL_STAKERS = new Set([ASSET_SAFE, TREASURY]);
export const ZERO = '0x0000000000000000000000000000000000000000';
export const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // Verified Base settlement token, 6 decimals

// Verified deployed Marketplace implementations snapshot auction fees at creation.
// The first deployment is NOT a pre-snapshot implementation. See each BaseScan source.
export const MARKET_VERSIONS: Record<string, { auctionSnapshot: boolean; native: boolean }> = {
  '0x6d7a0b4b2b1a0d26336addbccd07a41580778717': { auctionSnapshot: true, native: true },
  '0xf4e0c379c19a6de65cf9b52492637278cd116c06': { auctionSnapshot: true, native: true },
  // ERC20-only since block 51294225; fee and auction snapshot arithmetic unchanged.
  '0xbcb3745a6c7e85d38bce1d828214be60cea734a6': { auctionSnapshot: true, native: false },
};
// Monetary events before this verified implementation fail explicitly. The observed
// pre-upgrade box history contains no draws/settlements; it is not silently discarded.
export const BOX_VERSION = '0x5a209fad25b9300e6e9abe84d58dc13e9b1151e6';
export const BOX_VERSIONS: Record<string, { sourceScoped: boolean }> = {
  [BOX_VERSION]: { sourceScoped: false },
  '0x4267a71b93aed76064e3b292eb6763a172b76ed9': { sourceScoped: false },
  '0x7a17fc80510db62a7d8c7ebf8fc1d5aff00e8c5f': { sourceScoped: false },
  '0x474b9863033a34918c72fc711f72470372bc0cbb': { sourceScoped: true },
};
// Referral activation boundary, NOT a statistics end date. Earlier windows have
// no referral expense; later windows require the complete public settlement feed
// in referrals.ts and fail explicitly if its coverage is unavailable.
export const REFERRAL_COVERAGE_END = 1791623175; // 2026-10-10T09:06:15Z

export interface Inputs {
  statisticsStart?: { timestamp: number; block: number; source: string };
  excludedTransactions: Record<string, string>; // exact tx hash -> public reason/source
}

// Deployment-day scope confirmed by the project on 2026-10-13, including real
// internal-test activity. Supplier entitlement follows the historical staker;
// custody, operator signing and subsequent NFT ownership do not change it.
export const inputs: Inputs = {
  statisticsStart: {
    timestamp: 1788060247,
    block: MARKET_BLOCK,
    source: 'https://basescan.org/tx/0x69a0d7c929ead429912d4b735da7a3cead9e5c2bc4f5f865b27edf1f9fee8397',
  },
  excludedTransactions: {},
};
