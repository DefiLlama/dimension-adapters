// NextRare — cross-chain NFT gacha protocol.
//
// Tracks daily user payments via the Collector contract's own typed events
// (`Deposited` + `CrossmintPurchase`) emitted by the CREATE2-deployed Collector
// at the same address on every supported chain.
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
//
// Economics: user payments for gacha packs are non-refundable and accrue
// 100% to the NextRare treasury — there is no LP, no external holders, no
// revenue split. We therefore report Fees == Revenue == ProtocolRevenue.

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Same CREATE2 address on every EVM chain.
const COLLECTOR = "0x0000000032B93DAf5c6Ff220cB2D03624CB56302";

const DEPOSITED_EVENT =
  "event Deposited(address indexed from, address indexed to, uint64 indexed intentId, uint64 amount, address token)";

const CROSSMINT_EVENT =
  "event CrossmintPurchase(address indexed from, address indexed to, uint16 quantity, uint64 normalizedAmount, address token)";

// Labels (must exactly match keys in breakdownMethodology below).
const LABEL_CROSS_CHAIN = "Cross-chain Deposit";
const LABEL_CROSSMINT   = "Crossmint Purchase";

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
  const dailyFees    = options.createBalances();
  const dailyRevenue = options.createBalances();

  const [deposits, crossmints] = await Promise.all([
    options.getLogs({ target: COLLECTOR, eventAbi: DEPOSITED_EVENT }),
    options.getLogs({ target: COLLECTOR, eventAbi: CROSSMINT_EVENT }),
  ]);

  // Convert 6-decimal BigInt amounts directly to USD — treats every payment
  // as $1 stable regardless of source token (sidesteps per-chain price
  // lookups for USDm/bridged USDC/USDT variants).
  deposits.forEach((log: any) => {
    const usd = Number(log.amount) / 1e6;
    dailyFees.addUSDValue(usd, LABEL_CROSS_CHAIN);
    dailyRevenue.addUSDValue(usd, LABEL_CROSS_CHAIN);
  });
  crossmints.forEach((log: any) => {
    const usd = Number(log.normalizedAmount) / 1e6;
    dailyFees.addUSDValue(usd, LABEL_CROSSMINT);
    dailyRevenue.addUSDValue(usd, LABEL_CROSSMINT);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Gross user payments for gacha pack purchases into the NextRare Collector contract on every supported chain.",
  Revenue: "User payments are non-refundable and accrue 100% to the NextRare treasury — no LP or external holders.",
  ProtocolRevenue: "Same as Revenue — the NextRare treasury captures all user payments.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL_CROSS_CHAIN]:
      "USDC/USDT on Base/Arbitrum/BSC/Mantle/HyperEVM/Monad (or USDm on MegaETH) paid via Collector.deposit(), settled cross-chain into a MegaETH GiftCard mint.",
    [LABEL_CROSSMINT]:
      "Purchases made directly through Crossmint (credit-card / non-crypto checkout) via Collector.mint().",
  },
  Revenue: {
    [LABEL_CROSS_CHAIN]: "Cross-chain deposits accrue to the NextRare treasury.",
    [LABEL_CROSSMINT]:   "Crossmint purchases accrue to the NextRare treasury.",
  },
  ProtocolRevenue: {
    [LABEL_CROSS_CHAIN]: "Cross-chain deposits accrue to the NextRare treasury.",
    [LABEL_CROSSMINT]:   "Crossmint purchases accrue to the NextRare treasury.",
  },
};

const adapters: Record<string, { fetch: typeof fetch; start: string }> = {};
Object.keys(config).forEach((chain) => {
  adapters[chain] = { fetch, start: config[chain].start };
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: adapters,
  methodology,
  breakdownMethodology,
};

export default adapter;
