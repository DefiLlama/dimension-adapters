// NextRare — cross-chain NFT gacha protocol.
//
// Tracks daily user payment volume via the Collector contract's own typed
// events (`Deposited` + `CrossmintPurchase`) emitted by the CREATE2-deployed
// Collector at the same address on every supported chain.
//
// These events are emitted by the Collector — not by the token contract —
// because Collector uses `transferFrom(user, treasury, amount)` to forward
// funds directly to the Safe treasury. The ERC-20 Transfer event therefore
// has `from=user, to=treasury` with no Collector address in topics, so we
// must hook the typed events.
//
// Both events carry amount fields normalized to 6 decimals by the contract's
// `_normalize()` function before emission, so every log is priced as canonical
// USDC @ $1 regardless of source-chain token decimals (handles BSC 18-decimal
// USDC/USDT and MegaETH 18-decimal USDm uniformly).

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Same CREATE2 address on every EVM chain.
const COLLECTOR = "0x0000000032B93DAf5c6Ff220cB2D03624CB56302";

// Canonical USDC on Ethereum — $1-stable pricing proxy. Collector emits
// amounts already normalized to 6 decimals, matching USDC's decimals.
const USDC_ETHEREUM = "0xA0b86991c6218b36c1d19d4a2e9Eb0cE3606eB48";

const DEPOSITED_EVENT =
  "event Deposited(address indexed from, address indexed to, uint64 indexed intentId, uint64 amount, address token)";

const CROSSMINT_EVENT =
  "event CrossmintPurchase(address indexed from, address indexed to, uint16 quantity, uint64 normalizedAmount, address token)";

// Collector CREATE2-deployed on all chains on 2026-03-23.
const config: Record<string, { start: string }> = {
  [CHAIN.BASE]:        { start: "2026-03-23" },
  [CHAIN.ARBITRUM]:    { start: "2026-03-23" },
  [CHAIN.BSC]:         { start: "2026-03-23" },
  [CHAIN.MANTLE]:      { start: "2026-03-23" },
  [CHAIN.HYPERLIQUID]: { start: "2026-03-23" },
  [CHAIN.MONAD]:       { start: "2026-03-23" },
  [CHAIN.MEGAETH]:     { start: "2026-03-23" },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const [deposits, crossmints] = await Promise.all([
    options.getLogs({ target: COLLECTOR, eventAbi: DEPOSITED_EVENT }),
    options.getLogs({ target: COLLECTOR, eventAbi: CROSSMINT_EVENT }),
  ]);

  // Both `amount` and `normalizedAmount` are already 6-decimal-normalized
  // by Collector._normalize() before emission — price as ethereum-USDC @ $1.
  deposits.forEach((log: any) => dailyVolume.add(USDC_ETHEREUM, log.amount));
  crossmints.forEach((log: any) => dailyVolume.add(USDC_ETHEREUM, log.normalizedAmount));

  return { dailyVolume };
};

const adapters: Record<string, { fetch: typeof fetch; start: string }> = {};
Object.keys(config).forEach((chain) => {
  adapters[chain] = { fetch, start: config[chain].start };
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: adapters,
};

export default adapter;
