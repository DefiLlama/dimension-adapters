import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// AxiumPass is non-custodial recurring stablecoin subscription infrastructure
// (https://axiumpass.com). A subscriber approves an ERC-20 allowance once and
// creates a subscription in a SubscriptionVault; each billing period the
// keeper (or the subscriber themself) calls processSubscription, which pulls
// the payment and forwards 100% of it directly to the merchant in the same
// transaction — the vault never holds funds and takes no on-chain fee, so
// there is no fees/revenue dimension to report (same situation as LlamaPay).
//
// We report as payment volume the value settled to merchants, summed on-chain
// from SubscriptionProcessed events. The event has the same signature on both
// vault generations, so v1 and v2 are queried in a single getLogs call:
//   SubscriptionProcessed(id, subscriber, recipient, token, amount, timestamp)
//
// WHY THE TOKEN ALLOWLIST BELOW EXISTS — this is the correction
//
//   The first version of this adapter summed EVERY SubscriptionProcessed event
//   regardless of token, while its own published methodology claimed the amounts
//   were "the stablecoin value (USDC/USDT/EURC)". Those two statements cannot
//   both be true, because the v1 vault does not restrict the token: its
//   createSubscription only requires `token != address(0)` (see
//   github.com/Kais769/axiumpass-contracts, SubscriptionVault.sol).
//
//   Consequence: any priced ERC-20 that reached the vault was reported as
//   AxiumPass subscription volume, denominated in whatever that token was
//   worth. The allowlist removes exactly that: the reported number is now
//   denominated in the stablecoins the methodology names, and nothing else.
//
//   The filter is applied here, in the adapter, rather than on-chain, because
//   the deployed v1 vaults are immutable and merchants' live subscriptions must
//   keep working. The allowlist is the set of tokens AxiumPass actually offers
//   at checkout on each chain; anything else is simply not counted.
//
// WHAT THIS DOES **NOT** FIX, STATED PLAINLY
//
//   The allowlist does not make this number unfarmable, and an earlier draft of
//   this comment implied that it did. It does not.
//
//   Because the v1 vault is permissionless, anyone can create a subscription
//   from an address they control to an address they control, in real USDC, and
//   call processSubscription: the vault pulls the amount and forwards 100% of it
//   back to them in the same transaction. They are left whole minus gas, and the
//   reported volume rises by the full amount. No funds are ever at risk — the
//   vault is non-custodial and the attacker only pays themself — but the number
//   is inflatable for the price of gas.
//
//   Eliminating that requires filtering on a source that the protocol controls,
//   i.e. counting only recipients enrolled through AxiumPass checkout. That
//   enrolment does not exist on-chain in the v1 vault, so it cannot be derived
//   from the logs alone; it lives in AxiumPass's own records. If the maintainers
//   want that filter, AxiumPass can publish the enrolled recipient set as a
//   public endpoint for this adapter to read — say the word and it will be in
//   the next revision.
//
// All vault sources are verified on each chain's explorer; the public mirror
// is https://github.com/Kais769/axiumpass-contracts.
// v1 shares one address on Polygon/Arbitrum/Optimism (same deployer wallet,
// same CREATE nonce); Base was deployed at a different nonce.

type ChainCfg = { vaults: string[]; tokens: string[]; start: string };

// Lowercased on purpose: event logs do not guarantee address casing, so every
// comparison below goes through toLowerCase(). Comparing checksummed strings
// would silently drop real volume — a filter that over-filters is as wrong as
// no filter at all.
const chainConfig: Record<string, ChainCfg> = {
  [CHAIN.POLYGON]: {
    vaults: [
      "0x72ddc27e44FD5F8dCfb494317241c4e60575eEd3", // SubscriptionVault v1
      "0xe9234C7706a7b15A20947fCBd8390c808c523646", // SubscriptionVault4337 v2 (Jul 2026)
    ],
    tokens: [
      "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT (6 dec)
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC native (6 dec)
    ],
    start: "2026-06-10", // conservative lower bound: v1 vault deployed mid-June 2026
  },
  [CHAIN.BASE]: {
    vaults: [
      "0x162c5212C224137033919c6EE23Aee6A80a8bB78", // SubscriptionVault v1
      "0x6Ed0049DD3F8d6eb24f81fc1ad9978D50cd1D7d8", // SubscriptionVault4337 v2 (Jul 2026)
    ],
    tokens: [
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC (6 dec)
      "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", // EURC (6 dec)
    ],
    start: "2026-07-05", // v1 vault deployment day on Base
  },
  [CHAIN.ARBITRUM]: {
    vaults: [
      "0x72ddc27e44FD5F8dCfb494317241c4e60575eEd3", // SubscriptionVault v1
      "0x1dd00Dfb68773d2043e24A0Ebb6EAdC2e6Ab1953", // SubscriptionVault4337 v2 (Jul 2026)
    ],
    tokens: [
      "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC native (6 dec)
      "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT (6 dec)
    ],
    start: "2026-07-06", // v1 vault deployment day on Arbitrum
  },
  [CHAIN.OPTIMISM]: {
    vaults: [
      "0x72ddc27e44FD5F8dCfb494317241c4e60575eEd3", // SubscriptionVault v1
      "0x1dd00Dfb68773d2043e24A0Ebb6EAdC2e6Ab1953", // SubscriptionVault4337 v2 (Jul 2026)
    ],
    tokens: [
      "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC native (6 dec)
      "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // USDT (6 dec)
    ],
    start: "2026-07-06", // v1 vault deployment day on Optimism
  },
  // ── Avalanche and BNB: v1 ONLY, and that is not an omission ──────────────
  //
  // Both chains settle real subscription payments (`payments_enabled: true` on
  // GET /api/onchain/config, measured 2026-08-13), so leaving them out of this
  // adapter would under-report AxiumPass volume — the mirror-image of the
  // token-farming problem the allowlist above prevents. A metric that can be
  // farmed is not a metric; neither is one that silently drops two chains.
  //
  // Their `vault_v2_address` is null: the v2 vault was never deployed there.
  // Listing a v2 address here "for symmetry" would make this adapter query a
  // contract that does not exist, so each entry carries only what is on-chain.
  [CHAIN.AVAX]: {
    vaults: [
      "0x72ddc27e44FD5F8dCfb494317241c4e60575eEd3", // SubscriptionVault v1
    ],
    tokens: [
      "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC native (6 dec)
      "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT (6 dec)
      "0xc891eb4cbdeff6e073e859e987815ed1505c2acd", // EURC native (6 dec)
    ],
    start: "2026-07-13", // day both chains were integrated
  },
  [CHAIN.BSC]: {
    vaults: [
      "0x72ddc27e44FD5F8dCfb494317241c4e60575eEd3", // SubscriptionVault v1
    ],
    tokens: [
      // USDT on BNB is 18 decimals, not 6. createBalances() reads decimals from
      // the token itself, so no scaling happens here — but the single-token
      // allowlist is deliberate: the "USDC" commonly seen on BNB is Binance-Peg
      // bridged, which AxiumPass does not offer at checkout and therefore does
      // not count.
      "0x55d398326f99059ff775485246999027b3197955", // USDT (18 dec)
    ],
    start: "2026-07-13",
  },
};

const SubscriptionProcessedEvent =
  "event SubscriptionProcessed(uint256 indexed id, address indexed subscriber, address indexed recipient, address token, uint256 amount, uint256 timestamp)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const cfg = chainConfig[options.chain];
  const allowed = new Set(cfg.tokens);

  const logs = await options.getLogs({
    targets: cfg.vaults,
    eventAbi: SubscriptionProcessedEvent,
  });
  for (const log of logs) {
    // Only the stablecoins AxiumPass actually offers at checkout are counted.
    // Any other ERC-20 that reached the permissionless v1 vault is ignored on
    // purpose — see the note at the top of this file.
    if (!allowed.has(String(log.token).toLowerCase())) continue;
    dailyVolume.add(log.token, log.amount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Recurring subscription payments settled to recipients, summed on-chain from SubscriptionProcessed events of the AxiumPass SubscriptionVault contracts (v1 and v2) on each chain. Only the stablecoins AxiumPass offers at checkout are counted (USDC, USDT, EURC — per-chain allowlist in the adapter): the v1 vault is permissionless on the token argument, so any other ERC-20 that reached it is excluded rather than reported as subscription volume, which keeps the reported figure denominated in the tokens named here. Each counted amount is pulled from the subscriber and forwarded 100% to the recipient in the same transaction. The vaults are non-custodial and charge no on-chain fee, so no fees/revenue is reported. Limitation: the v1 vault is also permissionless on enrolment, so a subscription created from an address to itself is indistinguishable on-chain from a merchant payment and is counted; excluding it would require filtering on AxiumPass's enrolled-recipient set, which is not present in the logs.",
  },
  adapter: chainConfig,
  fetch,
};

export default adapter;
