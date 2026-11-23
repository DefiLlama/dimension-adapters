import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// HASHCATS — a proof-of-work NFT collection on Robinhood Chain (chainId 4663).
//
// Everything a user can do to the protocol happens on the collection contract
// and each action carries the address that performed it:
//
//   Mined       - a miner submitted a valid hash and paid for the cat.
//   RentClaimed - a cat owner withdrew the rent their cats have accrued.
//   CatBurned   - an owner destroyed a cat in exchange for $HASH.
//
// Trading $HASH is deliberately not counted. Swaps reach the pool through
// routers, so the address on the swap is the router rather than the trader, and
// interactions that go through a middleman contract do not count as direct
// interactions with the protocol.
const COLLECTION = "0xca75df55cc9c476db27a7375d1fc8e794cf80721";

const activityEvents = [
  {
    userField: "miner",
    eventAbi:
      "event Mined(uint256 indexed tokenId, address indexed miner, uint256 seed, uint256 work, bytes32 anchor, uint256 target, uint256 nonce, uint256 unique)",
  },
  {
    userField: "to",
    eventAbi: "event RentClaimed(uint256 indexed tokenId, address indexed to, uint256 amount, uint256 cursor)",
  },
  {
    userField: "by",
    eventAbi: "event CatBurned(uint256 indexed tokenId, address indexed by, uint256 tokens, uint256 rent)",
  },
] as const;

const fetch = async (options: FetchOptions) => {
  const logsByEvent = await Promise.all(
    activityEvents.map(({ eventAbi }) =>
      options.getLogs({ targets: [COLLECTION], eventAbi, onlyArgs: false })
    )
  );

  const users = new Set<string>();
  const transactions = new Set<string>();

  logsByEvent.forEach((logs, eventIndex) => {
    const { userField } = activityEvents[eventIndex];
    logs.forEach((log: any) => {
      const user = log.args?.[userField];
      if (typeof user === "string") users.add(user.toLowerCase());
      if (typeof log.transactionHash === "string") transactions.add(log.transactionHash.toLowerCase());
    });
  });

  return {
    dailyActiveUsers: users.size,
    dailyTransactionsCount: transactions.size,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // The collection's code appears in block 60412470, and the first cat is mined
  // a few minutes later in block 60415844.
  start: "2026-09-11",
  methodology:
    "Counts unique addresses that interacted with the HASHCATS collection directly - mining a cat (Mined), claiming accrued rent (RentClaimed) or burning a cat for $HASH (CatBurned) - and the transactions those actions occurred in. Rent is usually claimed for several cats at once, so transactions are fewer than events. Swaps of $HASH are excluded: they arrive through routers, so the address on a swap is the router rather than the trader.",
};

export default adapter;
