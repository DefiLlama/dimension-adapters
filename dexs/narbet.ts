import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";

const pairs = [
  // Coin Flip
  {
    target: "0xa7f902847a16F1CDbF043c0653865D40e6695de5",
    eventAbi: "event CoinFlip_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] coinOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Dice
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

// Hard-coded rate in smart contract
const FEE_RATE = 0.1 / 100;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs: any[] = [];
  for (const pair of pairs) {
    const gameLogs = await options.getLogs({
      target: pair.target,
      eventAbi: pair.eventAbi,
    });
    logs.push(...gameLogs);
  }

  for (const log of logs) {
    let wagerRaw;
    if ('wager' in log && !('totalWager' in log)) {
      wagerRaw = BigNumber(log.wager);
      if ('payouts' in log) {
        wagerRaw = wagerRaw.multipliedBy(log.payouts.length);
      }
    } else if ('totalWager' in log) {
      wagerRaw = BigNumber(log.totalWager);
    } else {
      console.warn("Unreachable code for log", log)
      continue;
    }
    const wagerStandardized = wagerRaw.dividedBy(1e18).toNumber();
    dailyVolume.addCGToken('monad', wagerStandardized)
    dailyFees.addCGToken('monad', wagerStandardized * FEE_RATE);
  }

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2025-10-24',
  methodology: {
    Volume: 'Total wager from all betting contracts.',
    Fees: 'There is amount of 0.1% wager collected as fees.',
  }
}

export default adapter;