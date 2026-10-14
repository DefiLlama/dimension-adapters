import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// PFWA Sherwood (https://sherwood.pfwa.fun, https://x.com/pfwafun): a PvP arena game built into Uniswap v4 hooks on
// Robinhood Chain, part of PFWA. Source: https://github.com/MirakoolDev/sherwood
// Every exact-input swap in a game pool pays 5% of its ETH side (FEE_BPS = 500) into the current round's pot, logged
// as PotFunded. A Flip move pays its Dice Protocol randomness fee out of the pot (FlipRequested; the fee is the Dice
// contract's getFeeV2(provider, FLIP_CALLBACK_GAS = 200000) in that block, the same call the hook makes). When a round
// ends what is left in its pot is split by fixed shares (constants in the hook's settle function):
//   Season 1 (Sherwood.sol, ETH/$PFWA pool): 50/20/10% to the top three players, 10% buys back and burns $PFWA,
//     10% rolls over into the next round.
//   Season 2 (SherwoodV2.sol, ETH/$IMD pool): 40/20/10% to the top three and 8% to the King of the Hill, 10% buys back
//     and burns $IMD (the pool's token, not PFWA's), 7% buys back and burns $PFWA, 5% rolls over.
// Fees are counted when the swap pays them: the window's Dice fees come off first (a supply-side cost, up to the window's
// pot fees), and the rest is split by those shares. The pots are also topped up by direct deposits (PotSeeded, so far all
// from the team wallet); those are not fees, and the burns they fund are not holders revenue, so the $PFWA buyback is
// measured at the fee source (its share of PotFunded) rather than from the BuybackBurned events. Dice refunds of flips
// that were never revealed go to the hook's buyback reserve; they are rare and not counted.
// The swaps' LP fees are Uniswap's, and their volume is counted by Uniswap v4, so neither is counted here.
const HOOKS: { hook: string; prizesBps: number; rolloverBps: number; pfwaBurnBps: number; imdBurnBps: number }[] = [
  // Season 1, ETH/$PFWA pool, live 2026-10-08 (verified on Sourcify)
  { hook: "0x0C9DDD9E45817252D56f70ec015A4E828212a0cc", prizesBps: 8000, rolloverBps: 1000, pfwaBurnBps: 1000, imdBurnBps: 0 },
  // Season 2, ETH/$IMD pool, deployed 2026-10-12 (src/SherwoodV2.sol: FIRST/SECOND/THIRD/KING_BPS, BURN_BPS, HOST_BURN_BPS, ROLLOVER_BPS)
  { hook: "0xc33c907127b94303F578d6Be551C36F45939e0cC", prizesBps: 7800, rolloverBps: 500, pfwaBurnBps: 700, imdBurnBps: 1000 },
];
const POT_FUNDED = "event PotFunded(uint256 indexed round, uint256 amount, bool fromSell)";
const FLIP_REQUESTED = "event FlipRequested(uint64 indexed sequence, uint256 indexed round, address indexed player, uint256 stake)";
const FLIP_CALLBACK_GAS = 200000; // FLIP_CALLBACK_GAS in both hooks

type Uint = bigint | string | number;
type PotFundedArgs = { round: Uint; amount: Uint; fromSell: boolean };
type FlipLog = { blockNumber: number | string };

const L = {
  POT_FEES: "Pot Fees",
  TO_DICE: "Pot Fees To Dice Randomness",
  TO_WINNERS: "Pot Fees To Winners",
  TO_NEXT_ROUND: "Pot Fees Rolled Into Next Round",
  TO_IMD_BURN: "Pot Fees To IMD Buyback And Burn",
  TO_PFWA_BURN: "Pot Fees To PFWA Buyback And Burn",
  PFWA_BURN: "PFWA Buyback And Burn",
};

// The Dice fees the hook paid out of its pot for the window's flips: getFeeV2 on the hook's Dice contract at each
// flip's block.
async function diceFees(options: FetchOptions, hook: string, flips: FlipLog[]): Promise<bigint> {
  if (!flips.length) return 0n;
  // both are immutables of the hook
  const dice: string = await options.api.call({ target: hook, abi: "address:dice" });
  const provider: string = await options.api.call({ target: hook, abi: "address:diceProvider" });
  let total = 0n;
  for (const flip of flips) {
    const fee: Uint = await options.api.call({
      target: dice,
      abi: "function getFeeV2(address provider, uint32 gasLimit) view returns (uint128)",
      params: [provider, FLIP_CALLBACK_GAS],
      block: Number(flip.blockNumber),
    });
    total += BigInt(fee);
  }
  return total;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const targets = HOOKS.map(({ hook }) => hook);
  const [potLogsByHook, flipLogsByHook]: [PotFundedArgs[][], FlipLog[][]] = await Promise.all([
    options.getLogs({ targets, eventAbi: POT_FUNDED, flatten: false }),
    options.getLogs({ targets, eventAbi: FLIP_REQUESTED, flatten: false, onlyArgs: false }),
  ]);

  for (let i = 0; i < HOOKS.length; i++) {
    const { hook, rolloverBps, pfwaBurnBps, imdBurnBps } = HOOKS[i];
    const fees = potLogsByHook[i].reduce((sum, log) => sum + BigInt(log.amount), 0n);
    if (fees === 0n && !flipLogsByHook[i].length) continue;
    // Season 2 only lets a flip go ahead when its own buy paid at least the Dice fee into the pot; in Season 1 the fee
    // (0.000025 ETH so far) is well under the 0.00005 ETH a minimum buy pays. The cap keeps the split non-negative if a
    // Dice fee ever came out of earlier pot money.
    const dice = await diceFees(options, hook, flipLogsByHook[i]);
    const toDice = dice < fees ? dice : fees;
    const settled = fees - toDice; // what is left for the round's settlement
    const toPfwaBurn = (settled * BigInt(pfwaBurnBps)) / 10000n;
    const toImdBurn = (settled * BigInt(imdBurnBps)) / 10000n;
    const toNextRound = (settled * BigInt(rolloverBps)) / 10000n;
    const toWinners = settled - toPfwaBurn - toImdBurn - toNextRound; // prizesBps of it (plus wei of rounding)
    dailyFees.addGasToken(fees, L.POT_FEES);
    if (toDice > 0n) dailySupplySideRevenue.addGasToken(toDice, L.TO_DICE);
    dailySupplySideRevenue.addGasToken(toWinners, L.TO_WINNERS);
    dailySupplySideRevenue.addGasToken(toNextRound, L.TO_NEXT_ROUND);
    if (toImdBurn > 0n) dailySupplySideRevenue.addGasToken(toImdBurn, L.TO_IMD_BURN);
    dailyRevenue.addGasToken(toPfwaBurn, L.TO_PFWA_BURN);
    dailyHoldersRevenue.addGasToken(toPfwaBurn, L.PFWA_BURN);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: 0, // the protocol keeps nothing: every pot goes to players, randomness and burns
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "The 5% of the ETH side of every swap in a Sherwood game pool that is paid into the round's prize pot. Direct deposits into the pots are not fees and are excluded.",
  UserFees: "The 5% of the ETH side of every swap in a Sherwood game pool, paid by the swapper into the round's prize pot.",
  Revenue: "The share of the pot fees that buys back and burns $PFWA: 10% in Season 1 (ETH/$PFWA pool) and 7% in Season 2 (ETH/$IMD pool) of what is left after the Dice randomness fees.",
  ProtocolRevenue: "Zero: the protocol keeps none of the pot fees.",
  HoldersRevenue: "The share of the pot fees spent buying back and burning $PFWA (10% in Season 1, 7% in Season 2, after Dice randomness fees), counted when the swap pays the fee. Burns funded by direct pot deposits are excluded.",
  SupplySideRevenue: "The Dice Protocol fees paid from the pot for Flip moves, then the share of the remaining pot fees paid to players: the round's prizes (80% in Season 1, 78% in Season 2), the share rolled into the next round's pot (10% and 5%), and in Season 2 the 10% that buys back and burns $IMD, the game pool's token.",
};

const breakdownMethodology = {
  Fees: {
    [L.POT_FEES]: "5% of the ETH side of every swap in a Sherwood game pool, paid into the round's prize pot.",
  },
  UserFees: {
    [L.POT_FEES]: "5% of the ETH side of every swap in a Sherwood game pool, paid by the swapper.",
  },
  Revenue: {
    [L.TO_PFWA_BURN]: "The pot share that buys back and burns $PFWA: 10% in Season 1, 7% in Season 2, of the pot fees left after Dice fees.",
  },
  HoldersRevenue: {
    [L.PFWA_BURN]: "The pot share that buys back and burns $PFWA: 10% in Season 1, 7% in Season 2, of the pot fees left after Dice fees, counted when the swap pays the fee.",
  },
  SupplySideRevenue: {
    [L.TO_DICE]: "The Dice Protocol randomness fee each Flip move pays out of the pot (getFeeV2 at the flip's block).",
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
