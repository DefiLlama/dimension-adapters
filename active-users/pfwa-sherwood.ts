import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { PFWA_PROTOCOL_WALLETS } from "../helpers/pfwa-markets";

// PFWA Sherwood (https://sherwood.pfwa.fun): a PvP arena game built into Uniswap v4 hooks on Robinhood Chain.
// Source: https://github.com/MirakoolDev/sherwood
// Users are the players (Played: every buy of at least 0.001 ETH in a game pool is a move, and the player is the wallet
// that signed the swap) and the wallets that claimed a prize or a referral reward. Plain swaps that are not moves are
// Uniswap v4 activity and are not counted. PFWA's own wallets are excluded.
const HOOKS = [
  "0x0C9DDD9E45817252D56f70ec015A4E828212a0cc", // Season 1, ETH/$PFWA pool (Sherwood.sol)
  "0xc33c907127b94303F578d6Be551C36F45939e0cC", // Season 2, ETH/$IMD pool (SherwoodV2.sol)
];
// `move` is the Move enum (uint8) in both hooks
const PLAYED = "event Played(uint256 indexed round, address indexed player, uint8 move, uint256 ethIn, uint256 pointsScored, address indexed target, uint256 pointsMoved)";
const PRIZE_CLAIMED = "event PrizeClaimed(uint256 indexed round, address indexed player, uint256 amount)";
const REFERRAL_CLAIMED = "event ReferralClaimed(address indexed referrer, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const [played, prizes, referrals] = await Promise.all(
    [PLAYED, PRIZE_CLAIMED, REFERRAL_CLAIMED].map((eventAbi) => options.getLogs({ targets: HOOKS, eventAbi, onlyArgs: false }))
  );
  const users = new Set<string>();
  const transactions = new Set<string>();
  const add = (user: string, tx: string) => {
    if (PFWA_PROTOCOL_WALLETS.has(String(user).toLowerCase())) return;
    users.add(String(user).toLowerCase());
    transactions.add(String(tx).toLowerCase());
  };
  for (const log of played) add(log.args.player, log.transactionHash);
  for (const log of prizes) add(log.args.player, log.transactionHash);
  for (const log of referrals) add(log.args.referrer, log.transactionHash);
  return { dailyActiveUsers: users.size, dailyTransactionsCount: transactions.size };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-08",
  methodology: {
    ActiveUsers: "Unique wallets that played a move in a Sherwood game pool (a buy of at least 0.001 ETH) or claimed a prize or referral reward during the day, excluding PFWA's own wallets.",
    TransactionsCount: "Transactions with at least one move or claim.",
  },
};

export default adapter;
