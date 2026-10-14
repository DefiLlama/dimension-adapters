import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// PFWA Sherwood (https://sherwood.pfwa.fun, https://x.com/pfwafun): a PvP arena game built into Uniswap v4 hooks on
// Robinhood Chain, part of PFWA. Source: https://github.com/MirakoolDev/sherwood
// Every exact-input swap in a game pool pays 5% of its ETH side (FEE_BPS = 500) into the current round's pot, logged
// as PotFunded. When a round ends its pot is split by fixed shares (constants in the hook's settle function):
//   Season 1 (Sherwood.sol, ETH/$PFWA pool): 50/20/10% to the top three players, 10% buys back and burns $PFWA,
//     10% rolls over into the next round.
//   Season 2 (SherwoodV2.sol, ETH/$IMD pool): 40/20/10% to the top three and 8% to the King of the Hill, 10% buys back
//     and burns $IMD (the pool's token, not PFWA's), 7% buys back and burns $PFWA, 5% rolls over.
// Fees are counted when the swap pays them and split by those shares. The pots are also topped up by direct deposits
// (PotSeeded, mostly from the team); those are not fees, and the burns they fund are not counted as holders revenue,
// so the $PFWA buyback is measured at the fee source (its share of PotFunded) rather than from the BuybackBurned events.
// The swaps' LP fees are Uniswap's, and their volume is counted by Uniswap v4, so neither is counted here.
const HOOKS: { hook: string; prizesBps: number; rolloverBps: number; pfwaBurnBps: number; imdBurnBps: number }[] = [
  // Season 1, ETH/$PFWA pool, live 2026-10-08 (verified on Sourcify)
  { hook: "0x0C9DDD9E45817252D56f70ec015A4E828212a0cc", prizesBps: 8000, rolloverBps: 1000, pfwaBurnBps: 1000, imdBurnBps: 0 },
  // Season 2, ETH/$IMD pool, deployed 2026-10-12 (src/SherwoodV2.sol: FIRST/SECOND/THIRD/KING_BPS, BURN_BPS, HOST_BURN_BPS, ROLLOVER_BPS)
  { hook: "0xc33c907127b94303F578d6Be551C36F45939e0cC", prizesBps: 7800, rolloverBps: 500, pfwaBurnBps: 700, imdBurnBps: 1000 },
];
const POT_FUNDED = "event PotFunded(uint256 indexed round, uint256 amount, bool fromSell)";

const L = {
  POT_FEES: "Pot Fees",
  TO_WINNERS: "Pot Fees To Winners",
  TO_NEXT_ROUND: "Pot Fees Rolled Into Next Round",
  TO_IMD_BURN: "Pot Fees To IMD Buyback And Burn",
  TO_PFWA_BURN: "Pot Fees To PFWA Buyback And Burn",
  PFWA_BURN: "PFWA Buyback And Burn",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const logsByHook = await options.getLogs({ targets: HOOKS.map(({ hook }) => hook), eventAbi: POT_FUNDED, flatten: false });
  logsByHook.forEach((logs: any[], i: number) => {
    const { rolloverBps, pfwaBurnBps, imdBurnBps } = HOOKS[i];
    for (const log of logs) {
      const fee = BigInt(log.amount);
      const toPfwaBurn = (fee * BigInt(pfwaBurnBps)) / 10000n;
      const toImdBurn = (fee * BigInt(imdBurnBps)) / 10000n;
      const toNextRound = (fee * BigInt(rolloverBps)) / 10000n;
      const toWinners = fee - toPfwaBurn - toImdBurn - toNextRound; // prizesBps of the fee (plus wei of rounding)
      dailyFees.addGasToken(fee, L.POT_FEES);
      dailySupplySideRevenue.addGasToken(toWinners, L.TO_WINNERS);
      dailySupplySideRevenue.addGasToken(toNextRound, L.TO_NEXT_ROUND);
      if (toImdBurn > 0n) dailySupplySideRevenue.addGasToken(toImdBurn, L.TO_IMD_BURN);
      dailyRevenue.addGasToken(toPfwaBurn, L.TO_PFWA_BURN);
      dailyHoldersRevenue.addGasToken(toPfwaBurn, L.PFWA_BURN);
    }
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: 0, // the protocol keeps nothing: every pot goes to players and burns
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "The 5% of the ETH side of every swap in a Sherwood game pool that is paid into the round's prize pot. Direct deposits into the pots are not fees and are excluded.",
  UserFees: "The 5% of the ETH side of every swap in a Sherwood game pool, paid by the swapper into the round's prize pot.",
  Revenue: "The share of the pot fees that buys back and burns $PFWA: 10% in Season 1 (ETH/$PFWA pool) and 7% in Season 2 (ETH/$IMD pool).",
  ProtocolRevenue: "Zero: the protocol keeps none of the pot fees.",
  HoldersRevenue: "The share of the pot fees spent buying back and burning $PFWA (10% in Season 1, 7% in Season 2), counted when the swap pays the fee. Burns funded by direct pot deposits are excluded.",
  SupplySideRevenue: "The share of the pot fees paid to players: the round's prizes (80% in Season 1, 78% in Season 2), the share rolled into the next round's pot (10% and 5%), and in Season 2 the 10% that buys back and burns $IMD, the game pool's token.",
};

const breakdownMethodology = {
  Fees: {
    [L.POT_FEES]: "5% of the ETH side of every swap in a Sherwood game pool, paid into the round's prize pot.",
  },
  UserFees: {
    [L.POT_FEES]: "5% of the ETH side of every swap in a Sherwood game pool, paid by the swapper.",
  },
  Revenue: {
    [L.TO_PFWA_BURN]: "The pot share that buys back and burns $PFWA: 10% in Season 1, 7% in Season 2.",
  },
  HoldersRevenue: {
    [L.PFWA_BURN]: "The pot share that buys back and burns $PFWA: 10% in Season 1, 7% in Season 2, counted when the swap pays the fee.",
  },
  SupplySideRevenue: {
    [L.TO_WINNERS]: "The round's prizes: 50/20/10% to the top three in Season 1; 40/20/10% to the top three and 8% to the King of the Hill in Season 2. Referral cuts, forfeited and unclaimed prizes stay within the players' pots.",
    [L.TO_NEXT_ROUND]: "The share that rolls into the next round's pot (10% in Season 1, 5% in Season 2).",
    [L.TO_IMD_BURN]: "Season 2 only: the 10% that buys back and burns $IMD, the game pool's token (not PFWA's).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-08",
  methodology,
  breakdownMethodology,
};

export default adapter;
