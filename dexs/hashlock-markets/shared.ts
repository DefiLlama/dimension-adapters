import * as sdk from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { queryEvents } from "../../helpers/sui";

// Cross-leg attribution: each cross-chain HTLC trade emits one Locked/Created
// event per leg, sharing the same `hashlock`. Per Hashlock Markets' atomic-swap
// protocol, the SOURCE leg (where the taker deposits, equivalently where the
// maker withdraws after preimage reveal) ALWAYS has a strictly longer timelock
// than the destination leg. We attribute the trade's volume to the source leg
// only, never to both legs — this is what bheluga@DefiLlama specified in the
// PR review (no `doublecounted` flag; single-count per trade on the
// taker-deposit / maker-withdraw chain).

// 48h lookback window for cross-leg matching. Hashlock timelocks are bounded
// well under 24h in practice; 48h gives a comfortable margin for paired legs
// that lock close to a window boundary.
const LOOKBACK_SECONDS = 48 * 60 * 60;

// Hashlock Markets Ethereum mainnet HTLC contracts.
// Source: https://github.com/Hashlock-Tech/hashlock-markets/blob/main/contracts/deployments-mainnet.json
export const ETH_HTLC_CONTRACTS = {
  HashedTimelockEther: "0x0CEDC56b17d714dA044954EE26F38e90eC10434A",
  HashedTimelockEtherFee: "0xfBAEA1423b5FBeCE89998da6820902fD8f159014",
  HashedTimelockERC20Fee: "0x4B65490D140Bab3DB828C2386e21646Ed8c4D072",
} as const;

// Event ABIs. Note: HashedTimelockEther (no-fee) and HashedTimelockEtherFee
// (with fee) emit events with the SAME name `HTLCETH_New` but DIFFERENT
// signatures (the fee variant has 4 extra fee-recipient/rebate fields), so
// they hash to different topic0 values and must be queried separately.
const ABI_HTLCETH_NEW_NO_FEE =
  "event HTLCETH_New(bytes32 indexed contractId, address indexed sender, address indexed receiver, uint256 amount, bytes32 hashlock, uint256 timelock)";
const ABI_HTLCETH_NEW_FEE =
  "event HTLCETH_New(bytes32 indexed contractId, address indexed sender, address indexed receiver, uint256 amount, bytes32 hashlock, uint256 timelock, address feeRecipient, uint16 feeBps, address rebateRecipient, uint16 rebateBps)";
const ABI_HTLCERC20_NEW_FEE =
  "event HTLCERC20_New(bytes32 indexed contractId, address indexed sender, address indexed receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, address feeRecipient, uint16 feeBps, address rebateRecipient, uint16 rebateBps)";

// Hashlock Markets Sui mainnet HTLC package.
export const SUI_PACKAGE =
  "0xd0f016aaec58d79c9108866b35e59412e3e95d7252464858c8141345f44bad0e";
export const SUI_MODULE = "htlc";

export type ChainName = "ethereum" | "sui";

export interface Leg {
  chain: ChainName;
  /** 0x-prefixed lowercase hex string. */
  hashlock: string;
  /** contractId on Ethereum, htlc_id on Sui — uniquely identifies a leg on its chain. */
  legId: string;
  /** Unix milliseconds. */
  timelockMs: number;
}

export interface LegIndex {
  byHashlock: Map<string, Leg[]>;
  byEthContractId: Map<string, Leg>;
  bySuiHtlcId: Map<string, Leg>;
}

function normalizeHashlock(input: unknown): string {
  if (typeof input === "string") {
    const s = input.toLowerCase();
    return s.startsWith("0x") ? s : `0x${s}`;
  }
  if (Array.isArray(input)) {
    const hex = (input as number[])
      .map((b) => Number(b).toString(16).padStart(2, "0"))
      .join("");
    return `0x${hex.toLowerCase()}`;
  }
  return "";
}

async function getEthBlock(timestamp: number): Promise<number> {
  // sdk.blocks.getBlockNumber is the modern API for chain-agnostic timestamp -> block resolution.
  const block = await (sdk.blocks as any).getBlockNumber("ethereum", timestamp);
  return typeof block === "number" ? block : (block?.number ?? block);
}

async function pullEthereumLegs(
  startTs: number,
  endTs: number
): Promise<Leg[]> {
  const fromBlock = await getEthBlock(startTs);
  const toBlock = await getEthBlock(endTs);

  const out: Leg[] = [];

  const callsCfg = [
    { target: ETH_HTLC_CONTRACTS.HashedTimelockEther, eventAbi: ABI_HTLCETH_NEW_NO_FEE },
    { target: ETH_HTLC_CONTRACTS.HashedTimelockEtherFee, eventAbi: ABI_HTLCETH_NEW_FEE },
    { target: ETH_HTLC_CONTRACTS.HashedTimelockERC20Fee, eventAbi: ABI_HTLCERC20_NEW_FEE },
  ];

  for (const cfg of callsCfg) {
    const logs = await sdk.indexer.getLogs({
      chain: "ethereum",
      target: cfg.target,
      eventAbi: cfg.eventAbi,
      fromBlock,
      toBlock,
      onlyArgs: true,
    });
    for (const ev of logs as any[]) {
      out.push({
        chain: "ethereum",
        hashlock: normalizeHashlock(ev.hashlock),
        legId: String(ev.contractId).toLowerCase(),
        timelockMs: Number(ev.timelock) * 1000,
      });
    }
  }

  return out;
}

async function pullSuiLegs(startTs: number, endTs: number): Promise<Leg[]> {
  const events: any[] = await queryEvents({
    eventModule: { package: SUI_PACKAGE, module: SUI_MODULE },
    options: { startTimestamp: startTs, endTimestamp: endTs },
  });

  const legs: Leg[] = [];
  for (const ev of events) {
    if (!ev || typeof ev.amount === "undefined" || typeof ev.hashlock === "undefined" || typeof ev.timelock_ms === "undefined") continue;
    legs.push({
      chain: "sui",
      hashlock: normalizeHashlock(ev.hashlock),
      legId: String(ev.htlc_id).toLowerCase(),
      timelockMs: Number(ev.timelock_ms),
    });
  }
  return legs;
}

/**
 * Build a hashlock -> [Leg] index across BOTH chains, with a 48h lookback so
 * paired legs that lock just outside the active window are still discoverable.
 *
 * Both chain fetchers call this independently and arrive at the same map (the
 * lookups are deterministic). This is wasteful but keeps each fetcher
 * self-contained, which is the DefiLlama adapter convention.
 */
export async function buildHashlockLegIndex(options: FetchOptions): Promise<LegIndex> {
  const startTs = options.startTimestamp - LOOKBACK_SECONDS;
  const endTs = options.endTimestamp;

  const [ethLegs, suiLegs] = await Promise.all([
    pullEthereumLegs(startTs, endTs),
    pullSuiLegs(startTs, endTs),
  ]);

  const byHashlock = new Map<string, Leg[]>();
  const byEthContractId = new Map<string, Leg>();
  const bySuiHtlcId = new Map<string, Leg>();

  for (const leg of [...ethLegs, ...suiLegs]) {
    if (!leg.hashlock) continue;
    const list = byHashlock.get(leg.hashlock) ?? [];
    list.push(leg);
    byHashlock.set(leg.hashlock, list);
    if (leg.chain === "ethereum") byEthContractId.set(leg.legId, leg);
    else bySuiHtlcId.set(leg.legId, leg);
  }

  return { byHashlock, byEthContractId, bySuiHtlcId };
}

/**
 * The source leg is the one with the longest timelock among all legs sharing
 * the hashlock. Per Hashlock Markets' atomic-swap protocol, this is always
 * the chain where the taker deposited / where the maker withdraws — i.e.,
 * the chain we should attribute volume to.
 *
 * Single-leg case: if only one leg is in the lookback window, count it.
 * No double-count is possible (only one leg exists in the index), and the
 * paired leg, if it ever existed, was outside the lookback so its volume
 * has already been (or will be) attributed in a different window.
 */
export function isSourceLeg(index: LegIndex, leg: Leg): boolean {
  const peers = index.byHashlock.get(leg.hashlock);
  if (!peers || peers.length === 0) return true;
  if (peers.length === 1) return true;
  const longest = peers.reduce((a, b) => (a.timelockMs >= b.timelockMs ? a : b));
  return longest.chain === leg.chain && longest.legId === leg.legId;
}
