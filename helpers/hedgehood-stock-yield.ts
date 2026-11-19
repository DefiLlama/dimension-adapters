import type { FetchOptions } from '../adapters/types';
import { CHAIN } from './chains';

// Stock Yield by HedgeHood, v2: every EpochFund is listed in a VaultRegistry (vaults()), with the registry's deployment
// block. v2.0 is closing (exits only); v2.1 runs on Robinhood Chain (weekly, USDG) and on BNB Chain (monthly covered
// calls on bStocks, USDT). Shared by the fees and options adapters; the TVL adapter (DefiLlama-Adapters) keeps its own
// copy of this list.
// https://sourcify.dev/server/v2/contract/4663/0xbc2cf782d3530c867157E6b7A7bBe2E0b636cDAf
const V2_REGISTRIES: Record<string, { registry: string, block: number }[]> = {
  [CHAIN.ROBINHOOD]: [
    { registry: '0x868502F926AE068B61EA9CC55042A9F962651e76', block: 88943541 }, // v2.0, 2026-10-15
    { registry: '0xbc2cf782d3530c867157E6b7A7bBe2E0b636cDAf', block: 103790627 }, // v2.1, 2026-11-01
  ],
  [CHAIN.BSC]: [
    { registry: '0xC78b6A83d75C5612a1A7323702B56038254a6459', block: 131164584 }, // v2.1, 2026-11-02
  ],
};

const ABI = {
  vaults: 'address[]:vaults',
  // the fund's stablecoin: USDG on Robinhood Chain, USDT on BNB Chain
  usdg: 'address:usdg',
};

// The v2 funds listed by the window's closing block, each with its stablecoin, and the first block worth scanning for
// their logs. Undefined when no registry or fund exists yet on the chain.
export async function getV2Funds(options: FetchOptions, fromBlock: number, toBlock: number) {
  const registries = (V2_REGISTRIES[options.chain] ?? []).filter(({ block }) => block <= toBlock);
  if (!registries.length) return;
  // a fund is created after its registry, so nothing to scan before the first registry was deployed
  fromBlock = Math.max(fromBlock, Math.min(...registries.map(({ block }) => block)));
  if (fromBlock > toBlock) return;
  // options.api reads at the window's closing block
  const funds: string[] = (await options.api.multiCall({ abi: ABI.vaults, calls: registries.map(({ registry }) => registry) })).flat();
  if (!funds.length) return;
  const stablecoins: string[] = await options.api.multiCall({ abi: ABI.usdg, calls: funds });
  return { funds, stablecoins, fromBlock };
}
