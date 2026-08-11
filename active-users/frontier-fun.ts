import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Frontier (frontier.fun) — bonding-curve token launchpad on Robinhood Chain (4663).
// Every market trades against one shared BondingCurve, and every launch goes
// through one factory, so two targets cover all user-facing activity. Swaps on a
// graduated token's Uniswap V4 pool are Uniswap activity, not Frontier's, and are
// excluded for the same reason the volume adapter excludes them.
// Both deployed in block 23472343; the factory registered this curve in the same
// block (BondingCurveUpdated) and has never pointed at another one.
// https://robinhoodchain.blockscout.com/address/0xCCa442899dFD80bf04340fa8C245C7EB02F71DD4
const BONDING_CURVE = "0xCCa442899dFD80bf04340fa8C245C7EB02F71DD4";
// https://robinhoodchain.blockscout.com/address/0x3cbC9395046607C083B383DC3588A3e8308dFf54
const FACTORY = "0x3cbC9395046607C083B383DC3588A3e8308dFf54";

const activityEvents = [
  {
    target: BONDING_CURVE,
    userField: "user",
    eventAbi:
      "event Buy(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)",
  },
  {
    target: BONDING_CURVE,
    userField: "user",
    eventAbi:
      "event Sell(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)",
  },
  {
    target: FACTORY,
    userField: "creator",
    eventAbi:
      "event CoinDeployed(address indexed creator, address indexed token, address factory, address lp, string name, string symbol, string description, string image, uint256 initialSupply, uint256 maxSupply, uint256 initialETHReserves, uint256 initialPrice, uint256 initialMarketCap, uint256 targetETH)",
  },
] as const;

async function fetch(options: FetchOptions) {
  const logsByEvent = await Promise.all(
    activityEvents.map(({ target, eventAbi }) =>
      options.getLogs({ targets: [target], eventAbi, onlyArgs: false })
    )
  );

  const users = new Set<string>();
  const transactions = new Set<string>();

  logsByEvent.forEach((logs, eventIndex) => {
    const { userField } = activityEvents[eventIndex];
    logs.forEach((log: any) => {
      const user = log.args?.[userField];
      if (typeof user === "string") users.add(user.toLowerCase());
      if (typeof log.transactionHash === "string")
        transactions.add(log.transactionHash.toLowerCase());
    });
  });

  return {
    dailyActiveUsers: users.size,
    dailyTransactionsCount: transactions.size,
  };
}

// Version 1 deliberately, despite this reading on-chain logs. dailyActiveUsers is
// a daily-unique count, which does not decompose into hourly slices: under
// version 2 the runner sums 24 hourly results, so a wallet that trades in six
// different hours is counted six times. Measured on 2026-08-05, the same day
// reports 20 active users at version 1 and 401 at version 2 + pullHourly, off the
// identical 914 transactions. Transaction counts do partition correctly, but the
// adapter cannot be split per metric. Every other active-users adapter is
// version 1 for the same reason.
const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // First CoinDeployed event, block 23650298.
  start: "2026-07-30",
  methodology:
    "Counts unique addresses that bought or sold on a Frontier bonding curve (BondingCurve Buy/Sell) or launched a token (BCTokenFactory CoinDeployed), and the transactions those actions occurred in. Swaps on graduated tokens' Uniswap V4 pools are counted as Uniswap activity and excluded here.",
};

export default adapter;
