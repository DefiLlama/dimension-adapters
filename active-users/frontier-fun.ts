import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Frontier (frontier.fun) — bonding-curve token launchpad on Robinhood Chain (4663).
// Every market trades against one shared BondingCurve, and every launch (curve or
// direct-seed) goes through one factory, so the two contracts of each deployment
// cover all user-facing activity. v1 (live 2026-07-30) and v1.2 (live 2026-08-15)
// are both counted; neither replaced the other in this adapter. Swaps on a token's
// Uniswap V4 pool are Uniswap activity, not Frontier's, and are excluded for the
// same reason the volume adapter excludes them.
// v1 — both deployed in block 23472343.
const BONDING_CURVE_V1 = "0xCCa442899dFD80bf04340fa8C245C7EB02F71DD4";
const FACTORY_V1 = "0x3cbC9395046607C083B383DC3588A3e8308dFf54";

// v1.2 production — both deployed in block 36671438.
const BONDING_CURVE_V12 = "0xEAaa2aE7De8B80d7a59eCF08B078EfAC6FcE6659";
const FACTORY_V12 = "0xe3A826C056e578c240D362BF4C2fa53E5c0c17a5";

const BUY_EVENT =
  "event Buy(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)";
const SELL_EVENT =
  "event Sell(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)";
const COIN_DEPLOYED_V1 =
  "event CoinDeployed(address indexed creator, address indexed token, address factory, address lp, string name, string symbol, string description, string image, uint256 initialSupply, uint256 maxSupply, uint256 initialETHReserves, uint256 initialPrice, uint256 initialMarketCap, uint256 targetETH)";
const COIN_DEPLOYED_V12 =
  "event CoinDeployed(address indexed creator, address indexed token, address factory, address lp, string name, string symbol, string description, string image, uint256 initialSupply, uint256 maxSupply, uint256 initialETHReserves, uint256 initialPrice, uint256 initialMarketCap, uint256 targetETH, bool indexed directSeed)";

const activityEvents = [
  { target: BONDING_CURVE_V1, userField: "user", eventAbi: BUY_EVENT },
  { target: BONDING_CURVE_V1, userField: "user", eventAbi: SELL_EVENT },
  { target: FACTORY_V1, userField: "creator", eventAbi: COIN_DEPLOYED_V1 },
  { target: BONDING_CURVE_V12, userField: "user", eventAbi: BUY_EVENT },
  { target: BONDING_CURVE_V12, userField: "user", eventAbi: SELL_EVENT },
  { target: FACTORY_V12, userField: "creator", eventAbi: COIN_DEPLOYED_V12 },
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

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // First CoinDeployed event (v1), block 23650298.
  start: "2026-07-30",
  methodology:
    "Counts unique addresses that bought or sold on a Frontier bonding curve (BondingCurve Buy/Sell) or launched a token (BCTokenFactory CoinDeployed) on either the v1 or v1.2 deployment, and the transactions those actions occurred in. Swaps on graduated tokens' Uniswap V4 pools are counted as Uniswap activity and excluded here.",
};

export default adapter;
