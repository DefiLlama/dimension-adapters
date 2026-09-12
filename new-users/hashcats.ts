import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// HASHCATS — first-time miners on Robinhood Chain (chainId 4663).
//
// Mining is the only way into this protocol: a cat cannot be bought from the
// collection, only mined, and everything else a user can do - claiming rent,
// burning a cat - requires owning one first. So an address mining its first cat
// is an address arriving at the protocol for the first time.
//
// There is no "first time" flag on-chain, so the window's miners are compared
// against every miner seen before it. One event type is scanned, which keeps the
// history cheap to walk even as it grows.
const COLLECTION = "0xca75df55cc9c476db27a7375d1fc8e794cf80721";

// Deployment block of the collection: the first cat is mined in it, so there is
// nothing to scan before it.
const FROM_BLOCK = 60412000;

const MINED =
  "event Mined(uint256 indexed tokenId, address indexed miner, uint256 seed, uint256 work, bytes32 anchor, uint256 target, uint256 nonce, uint256 unique)";

const fetch = async (options: FetchOptions) => {
  const windowStart = await options.getFromBlock();

  const [inWindow, before] = await Promise.all([
    options.getLogs({ target: COLLECTION, eventAbi: MINED }),
    // Everything from deployment up to the moment this window opens. When the
    // window is the protocol's first, the range is empty and every miner in it
    // is new. skipCache keeps this full-history read out of the window cache,
    // which is keyed by contract and would otherwise be overwritten by it.
    windowStart > FROM_BLOCK
      ? options.getLogs({
          target: COLLECTION,
          eventAbi: MINED,
          fromBlock: FROM_BLOCK,
          toBlock: windowStart - 1,
          skipCache: true,
        })
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  for (const log of before as any[]) seen.add(String(log.miner).toLowerCase());

  const fresh = new Set<string>();
  for (const log of inWindow as any[]) {
    const miner = String(log.miner).toLowerCase();
    if (!seen.has(miner)) fresh.add(miner);
  }

  return { dailyNewUsers: fresh.size };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-11",
  methodology:
    "Counts addresses that mined their first HASHCATS cat during the day. Mining is the only entry point into the protocol - cats cannot be bought from the collection, and claiming rent or burning a cat both require owning one - so a first-time miner is a first-time user. Each window's miners are compared against every miner recorded since the collection was deployed.",
};

export default adapter;
