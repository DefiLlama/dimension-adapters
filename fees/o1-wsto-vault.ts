import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// wstO: non-rebasing vault share of O; burning wstO leaves its O in the vault for the remaining holders.
// Each chain runs its own vault with an independent O/wstO rate.
// WstOLaunchHook is the Uniswap v4 hook of every wstO/launch-token pool created by WstOLaunchpadFactory
// 0xAC7Bd3254d7182a32ae3Ce7Fcd0ab86c88fcD91F (same address on both chains, factory.hook() = hook below).
// Pools are created with a 0 LP fee and hook-owned locked liquidity, so the quote burn is the only fee the pool
// itself charges. Routers can add their own fee on top (o1's router does; the o1-exchange adapter counts it).
const chainConfig: Record<string, { wsto: string; hook: string; start: string }> = {
  // https://staking.o1.exchange/?chain=4663
  // Sample swap: 0x03a08ba50ff9254107b5af049c7b2d5e7377e287b66079a7316c7a1aa89d617f
  [CHAIN.ROBINHOOD]: {
    wsto: "0xe92bd1c05e4e308792003c8205127a6fa662b4d4",
    hook: "0x96268d6832bf2c552bb30c5fd6ea92228d816acc",
    start: "2026-10-06", // hook deployed at block 81837838
  },
  // https://staking.o1.exchange/?chain=8453
  // Sample swap: 0xc83f805e448496666bf60f99592f6de0e167f7c5b79cc2dc68a62f88f1bdbb91
  [CHAIN.BASE]: {
    wsto: "0x80c6bae89b636c6ee96fe8f198c0d6926c2c91df",
    hook: "0xaa4b4fabf41754e759338778e6031a156eea6acc",
    start: "2026-10-05", // hook deployed at block 52196234
  },
};

// O has no coins-service price on Robinhood Chain; value it with its CoinGecko id on every chain.
const O_COINGECKO_ID = "o1-exchange";
const O_DECIMALS = 18;
// Bound RPC requests like the existing o1-launchpad adapter; Robinhood hours can span >10k blocks.
const MAX_BLOCK_RANGE = 5000;

// burnAmount is the quote token taken from each swap and burned in the same call (QuoteBurned).
const TradeEvent = "event Trade(bytes32 indexed poolId, address indexed executor, bool isBuy, address indexed quoteToken, uint256 grossQuoteAmount, uint256 launchTokenAmount, uint256 burnAmount, bytes32 comment)";

const LABEL_FEES = "wstO Swap Burn Fees";
const LABEL_HOLDERS = "wstO Swap Burn Fees To wstO Holders";

const fetch = async (options: FetchOptions) => {
  const { wsto, hook } = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  // wstO is the staked form of o1's own O token. Trader-funded share burns accrue to those
  // protocol-token holders, not external LPs/lenders; voluntary burns and donations are excluded.
  // https://docs.o1.exchange/launchpad/wsto/overview

  const trades = await options.getLogs({ target: hook, eventAbi: TradeEvent, maxBlockRange: MAX_BLOCK_RANGE });
  // The hook can serve other registered quote tokens; only wstO burns accrue to O stakers.
  const burnedShares = trades
    .filter((trade: any) => trade.quoteToken.toLowerCase() === wsto)
    .reduce((sum: bigint, trade: any) => sum + BigInt(trade.burnAmount), 0n);

  if (burnedShares > 0n) {
    // Value burned shares in O at the window's closing block (point-in-time share rate of this chain's vault).
    const burnedO = await options.api.call({
      target: wsto,
      abi: "function convertToAssets(uint256 shares) view returns (uint256)",
      params: [burnedShares.toString()],
    });
    // SDK CoinGecko balances require a Number for fractional token units; scale before converting.
    const amount = new BigNumber(burnedO).shiftedBy(-O_DECIMALS).toNumber();
    dailyFees.addCGToken(O_COINGECKO_ID, amount, LABEL_FEES);
    dailyRevenue.addCGToken(O_COINGECKO_ID, amount, LABEL_HOLDERS);
    dailyHoldersRevenue.addCGToken(O_COINGECKO_ID, amount, LABEL_HOLDERS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: "wstO taken from every swap in wstO/launch-token pairs and burned, valued as the O it redeems for in that chain's vault.",
    Revenue: "All wstO swap burn fees, burned so the O behind them stays in the vault for wstO holders.",
    HoldersRevenue: "All wstO swap burn fees: burning wstO raises the O redeemable per remaining wstO for every O staker on that chain.",
    ProtocolRevenue: "No swap fees go to the o1.exchange treasury.",
    SupplySideRevenue: "No burn fees go to LPs, creators or referrers; the full burn accrues to holders of staked protocol O tokens.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL_FEES]: "wstO burned by the wstO launch hook on buys and sells (1% buy/sell defaults, frozen per pool at creation from the factory defaults), valued in O at the period's closing share rate of that chain's vault.",
    },
    Revenue: {
      [LABEL_HOLDERS]: "All burned wstO; the O backing it stays in the vault and is shared by remaining wstO holders.",
    },
    HoldersRevenue: {
      [LABEL_HOLDERS]: "All burned wstO; the O backing it stays in the vault and is shared by remaining wstO holders.",
    },
  },
};

export default adapter;
