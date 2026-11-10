import { CHAIN } from './chains';

// Stock Yield by HedgeHood, v2: every EpochFund is listed in a VaultRegistry (vaults()), with the registry's deployment
// block. v2.0 is closing (exits only); v2.1 runs on Robinhood Chain (weekly, USDG) and on BNB Chain (monthly covered
// calls on bStocks, USDT). The fees, options and TVL adapters read the same registries.
// https://sourcify.dev/server/v2/contract/4663/0xbc2cf782d3530c867157E6b7A7bBe2E0b636cDAf
export const V2_REGISTRIES: Record<string, { registry: string, block: number }[]> = {
  [CHAIN.ROBINHOOD]: [
    { registry: '0x868502F926AE068B61EA9CC55042A9F962651e76', block: 88943541 }, // v2.0, 2026-10-15
    { registry: '0xbc2cf782d3530c867157E6b7A7bBe2E0b636cDAf', block: 103790627 }, // v2.1, 2026-11-01
  ],
  [CHAIN.BSC]: [
    { registry: '0xC78b6A83d75C5612a1A7323702B56038254a6459', block: 131164584 }, // v2.1, 2026-11-02
  ],
};
