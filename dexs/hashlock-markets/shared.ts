import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions } from "../../adapters/types";
import { queryEvents } from "../../helpers/sui";

const axios = require("axios");

// Cross-leg attribution: each cross-chain HTLC trade emits one Locked/Created
// event per leg, sharing the same `hashlock`. Per Hashlock Markets' atomic-swap
// protocol, the SOURCE leg (where the taker deposits, equivalently where the
// maker withdraws after preimage reveal) ALWAYS has a strictly longer timelock
// than the destination leg (gap is fixed at 1800s by `validateTimelockGap`).
// We attribute the trade's volume to the source leg only, never to both legs.
// This is what bheluga@DefiLlama specified in the PR review (no `doublecounted`
// flag; single-count per trade on the taker-deposit / maker-withdraw chain).

// 48h lookback window for cross-leg matching. Hashlock timelocks are bounded
// well under 24h in practice; 48h gives a comfortable margin for paired legs
// that lock close to a window boundary.
const LOOKBACK_SECONDS = 48 * 60 * 60;

// Public Ethereum RPCs. We need a chain-agnostic getLogs that works without a
// Llama-Indexer API key (the dimension-adapters CI runs without it), so we
// query the RPC directly via JSON-RPC. Ordered by tested reliability for
// eth_getLogs with multi-thousand-block ranges; we fall through on failure.
const ETH_RPCS = [
  "https://ethereum.publicnode.com",
  "https://eth.llamarpc.com",
  "https://eth.drpc.org",
];

// Conservative chunk size — drpc capped at ~5000 blocks; publicnode supports
// far more. Splitting at 5k keeps every RPC viable as a fallback.
const ETH_BLOCK_CHUNK = 5000;

// Hashlock Markets Ethereum mainnet HTLC contracts.
// Source: https://github.com/Hashlock-Tech/hashlock-markets/blob/main/contracts/deployments-mainnet.json
export const ETH_HTLC_CONTRACTS = {
  HashedTimelockEther: "0x0CEDC56b17d714dA044954EE26F38e90eC10434A",
  HashedTimelockEtherFee: "0xfBAEA1423b5FBeCE89998da6820902fD8f159014",
  HashedTimelockERC20Fee: "0x4B65490D140Bab3DB828C2386e21646Ed8c4D072",
} as const;

// Each contract's HTLC*_New event signature differs (no-fee 6-arg vs fee 10-arg
// vs ERC20 11-arg), so they hash to different topic0 values. Build one
// Interface per contract for clean parseLog().
const IFACE_ETH_NO_FEE = new ethers.Interface([
  "event HTLCETH_New(bytes32 indexed contractId, address indexed sender, address indexed receiver, uint256 amount, bytes32 hashlock, uint256 timelock)",
]);
const IFACE_ETH_FEE = new ethers.Interface([
  "event HTLCETH_New(bytes32 indexed contractId, address indexed sender, address indexed receiver, uint256 amount, bytes32 hashlock, uint256 timelock, address feeRecipient, uint16 feeBps, address rebateRecipient, uint16 rebateBps)",
]);
const IFACE_ERC20_FEE = new ethers.Interface([
  "event HTLCERC20_New(bytes32 indexed contractId, address indexed sender, address indexed receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, address feeRecipient, uint16 feeBps, address rebateRecipient, uint16 rebateBps)",
]);

const TOPIC_ETH_NEW_NO_FEE = IFACE_ETH_NO_FEE.getEvent("HTLCETH_New")!.topicHash;
const TOPIC_ETH_NEW_FEE = IFACE_ETH_FEE.getEvent("HTLCETH_New")!.topicHash;
const TOPIC_ERC20_NEW = IFACE_ERC20_FEE.getEvent("HTLCERC20_New")!.topicHash;

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

async function ethGetLogsOneShot(rpc: string, params: {
  fromBlock: number;
  toBlock: number;
  address: string;
  topic0: string;
}): Promise<any[]> {
  const { data } = await axios.post(rpc, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getLogs",
    params: [
      {
        fromBlock: "0x" + params.fromBlock.toString(16),
        toBlock: "0x" + params.toBlock.toString(16),
        address: params.address.toLowerCase(),
        topics: [params.topic0],
      },
    ],
  });
  if (data?.error) {
    throw new Error(data.error.message ?? JSON.stringify(data.error));
  }
  return (data?.result ?? []) as any[];
}

async function ethGetLogs(params: {
  fromBlock: number;
  toBlock: number;
  address: string;
  topic0: string;
}): Promise<any[]> {
  const out: any[] = [];
  // Chunk the block range so the smallest-window RPC in the fallback list still serves it.
  for (let from = params.fromBlock; from <= params.toBlock; from += ETH_BLOCK_CHUNK) {
    const to = Math.min(from + ETH_BLOCK_CHUNK - 1, params.toBlock);
    let lastErr: unknown = null;
    let chunk: any[] | null = null;
    for (const rpc of ETH_RPCS) {
      try {
        chunk = await ethGetLogsOneShot(rpc, { ...params, fromBlock: from, toBlock: to });
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (chunk === null) {
      throw new Error(`eth_getLogs failed on all RPCs for blocks ${from}-${to}: ${(lastErr as Error)?.message ?? lastErr}`);
    }
    out.push(...chunk);
  }
  return out;
}

async function pullEthereumLegs(startTs: number, endTs: number): Promise<Leg[]> {
  const fromBlock = await sdk.blocks.getBlockNumber("ethereum", startTs);
  const toBlock = await sdk.blocks.getBlockNumber("ethereum", endTs);

  const out: Leg[] = [];

  const sources = [
    { address: ETH_HTLC_CONTRACTS.HashedTimelockEther, topic0: TOPIC_ETH_NEW_NO_FEE, iface: IFACE_ETH_NO_FEE },
    { address: ETH_HTLC_CONTRACTS.HashedTimelockEtherFee, topic0: TOPIC_ETH_NEW_FEE, iface: IFACE_ETH_FEE },
    { address: ETH_HTLC_CONTRACTS.HashedTimelockERC20Fee, topic0: TOPIC_ERC20_NEW, iface: IFACE_ERC20_FEE },
  ];

  for (const src of sources) {
    const rawLogs = await ethGetLogs({
      fromBlock,
      toBlock,
      address: src.address,
      topic0: src.topic0,
    });
    for (const raw of rawLogs) {
      try {
        const parsed = src.iface.parseLog({ topics: raw.topics as string[], data: raw.data as string });
        if (!parsed) continue;
        const contractId: string = parsed.args.contractId as string;
        const hashlock: string = parsed.args.hashlock as string;
        const timelock: bigint = parsed.args.timelock as bigint;
        out.push({
          chain: "ethereum",
          hashlock: normalizeHashlock(hashlock),
          legId: contractId.toLowerCase(),
          timelockMs: Number(timelock) * 1000,
        });
      } catch {
        // skip malformed log
      }
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
