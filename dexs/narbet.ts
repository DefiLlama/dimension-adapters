import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";

const games = [
  // Coin Flip
  {
    target: "0xa7f902847a16F1CDbF043c0653865D40e6695de5",
    eventAbi: "event CoinFlip_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] coinOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Dice / Range
  {
    target: "0x8baecE06d825d36b52cb588960aE707d6C76a54C",
    eventAbi: "event Dice_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, bool isOver, uint256[] diceOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Rock Paper Scissors
  {
    target: "0xDA18dC7bb27Ca2056Fa3cA3da3973218Dc18F8e3",
    eventAbi: "event RockPaperScissors_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] outcomes, uint8[] randomActions, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Slots
  {
    target: "0xe3C0B41413Bc9913E0ace43a64637EF6C4e39F97",
    eventAbi: "event Slots_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] slotIDs, uint256[] multipliers, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Mines
  {
    target: "0x1CE656bD09a59A59513c4460220031d49038739e",
    eventAbi: "event Mines_End_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint256 numMines, bool[25] revealedTiles, uint256 multiplier )",
  },
  // Plinko
  {
    target: "0xf970b3C6A1bd7745A07B317543EA999e4E98666c",
    eventAbi: "event Plinko_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] paths, uint8 numRows, uint8 risk, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Video Poker
  {
    target: "0x681D2C159EE77f660F5081a3c193fb9613b624C0",
    eventAbi: "event VideoPoker_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, (uint8,uint8)[5] playerHand, uint256 outcome, uint64 sequenceNumber, uint64 sequenceNumberStart )",
  },
  // Baccarat
  {
    target: "0xBEAaFcc7648354a0722350378bF2A295B9b946A8",
    eventAbi: "event Baccarat_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256[5] wager, uint256 totalPayout, address tokenAddress, (uint8,uint8)[6] playerHand, (uint8,uint8)[3] bankerCards, (uint8,uint8)[3] playerCards, uint256[3] outcome, uint256[5] payouts, uint64 sequenceNumber )",
  },
  // Roulette
  {
    target: "0x39AA4ECB48c52A018B2a1A700B89C4912FC39967",
    eventAbi: "event Roulette_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] rouletteType, uint256[] payouts, uint256 outcome, uint64 sequenceNumber )",
  },
  // Fish Prawn Crab
  {
    target: "0xbB1b4eE5D22ca19faa5aA9A55Caf4abAEd14607B",
    eventAbi: "event FishPrawnCrab_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] fishPrawnCrabType, uint256[] payouts, uint256[3] outcome, uint64 sequenceNumber )",
  },
  // Limbo
  {
    target: "0x11B83A467AbFF4c466294af94B99ACEF3D85929d",
    eventAbi: "event Limbo_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, uint256[] limboOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const logs: any[] = [];
  for (const game of games) {
    const gameLogs = await options.getLogs({
      target: game.target,
      eventAbi: game.eventAbi,
    });
    logs.push(...gameLogs);
  }

  for (const log of logs) {
    // Compute total wager for this bet
    let wagerRaw: BigNumber;
    let payoutRaw: BigNumber;

    if ('totalWager' in log) {
      // Multi-wager games: Baccarat, Roulette, FishPrawnCrab
      wagerRaw = BigNumber(log.totalWager);
      payoutRaw = BigNumber(log.totalPayout);
    } else if ('wager' in log) {
      // Single-wager games: wager is per-bet, multiply by numGames
      wagerRaw = BigNumber(log.wager);
      if ('payouts' in log) {
        wagerRaw = wagerRaw.multipliedBy(log.payouts.length);
      }
      payoutRaw = BigNumber(log.payout);
    } else {
      continue;
    }

    const wager = wagerRaw.dividedBy(1e18).toNumber();
    const payout = payoutRaw.dividedBy(1e18).toNumber();
    const ggr = wager - payout; // Gross gaming revenue (can be negative)

    // Volume: total wagers placed
    dailyVolume.addCGToken('monad', wager);

    // Fees/Revenue: GGR (house take, can be negative when players win)
    // The protocol has currently deposited all bankroll liquidity, so 100% of GGR is protocol revenue
    dailyFees.addCGToken('monad', ggr);
    dailyUserFees.addCGToken('monad', ggr);
    dailyRevenue.addCGToken('monad', ggr);
    dailyProtocolRevenue.addCGToken('monad', ggr);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2025-11-24',
  methodology: {
    Volume: 'Total wager amount from all 11 on-chain casino game contracts on Monad.',
    Fees: 'Gross gaming revenue (GGR): total wagers minus total payouts. Can be negative on days when players win more than they lose.',
    UserFees: 'Same as Fees — represents the net cost to players.',
    Revenue: 'Same as Fees. The protocol has currently deposited all bankroll liquidity, so 100% of GGR is protocol revenue.',
    ProtocolRevenue: 'Same as Fees. The protocol is currently the sole bankroll liquidity provider, so all house earnings go to the protocol.',
  }
}

export default adapter;
