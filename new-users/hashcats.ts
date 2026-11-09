import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryAllium, getAlliumChain } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

// HASHCATS — first-time miners on Robinhood Chain (chainId 4663).
//
// Mining is the only way into this protocol: a cat cannot be bought from the
// collection, only mined, and everything else a user can do - claiming rent,
// burning a cat - requires owning one first. So an address mining its first cat
// is an address arriving at the protocol for the first time.
//
// First-seen is computed in Allium (`crosschain.raw.logs`, same Robinhood
// source as fees/pools-trade) so later days do not re-download the full Mined
// history over RPC.
const COLLECTION = "0xca75df55cc9c476db27a7375d1fc8e794cf80721";

// The block the collection's code appears in. Nothing it emits can predate it.
// The first cat is mined a few minutes later, in block 60415844.
const FROM_BLOCK = 60412470;

// event Mined(uint256 indexed tokenId, address indexed miner, uint256 seed, uint256 work, bytes32 anchor, uint256 target, uint256 nonce, uint256 unique)
const MINED_TOPIC = "0xc55e0b0a04e8540e1f0182c2bb9f91e4a81748234b82abfe64ea7eec73a2d520";

const fetch = async (options: FetchOptions) => {
  const chain = getAlliumChain(options.chain);
  // Inner scan is all Mined logs up to the window end; the outer filter keeps
  // only miners whose first mine falls inside the window.
  const result = await queryAllium(`
    WITH first_mined AS (
      SELECT
        '0x' || LOWER(SUBSTR(topic2, 27)) AS miner,
        MIN(block_timestamp) AS first_seen
      FROM crosschain.raw.logs
      WHERE chain = '${chain}'
        AND address = '${COLLECTION}'
        AND topic0 = '${MINED_TOPIC}'
        AND topic2 IS NOT NULL
        AND block_number >= ${FROM_BLOCK}
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      GROUP BY 1
    )
    SELECT COUNT(*) AS new_users
    FROM first_mined
    WHERE first_seen >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND first_seen < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `);

  const row = result?.[0] ?? { new_users: 0 };
  return { dailyNewUsers: row.new_users };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  start: "2026-09-11",
  methodology:
    "Counts addresses that mined their first HASHCATS cat during the day. Mining is the only entry point into the protocol - cats cannot be bought from the collection, and claiming rent or burning a cat both require owning one - so a first-time miner is a first-time user. First-seen is the earliest Mined event for each miner on the collection since it was deployed.",
};

export default adapter;
