import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";

const games = [
  // Coin Flip (old + new)
  {
    target: "0xa7f902847a16F1CDbF043c0653865D40e6695de5",
    eventAbi: "event CoinFlip_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] coinOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  {
    target: "0xFfbfB423dE2a5305004aeA3bdF6bD4917E87A962",
    eventAbi: "event CoinFlip_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] coinOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Dice (old legacy)
  {
    target: "0x8baecE06d825d36b52cb588960aE707d6C76a54C",
    eventAbi: "event Dice_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, bool isOver, uint256[] diceOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Range (old, used Dice events)
  {
    target: "0xD1EbacbBAC3D800dc413A5f5d0DD62855F832203",
    eventAbi: "event Dice_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, bool isOver, uint256[] diceOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Range (new, replaces Dice)
  {
    target: "0xEeBB73F7B52cD86ABc76e1fce2b5a38A684BCacc",
    eventAbi: "event Range_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, bool isOver, uint256[] rangeOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Rock Paper Scissors (old + new)
  {
    target: "0xDA18dC7bb27Ca2056Fa3cA3da3973218Dc18F8e3",
    eventAbi: "event RockPaperScissors_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] outcomes, uint8[] randomActions, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  {
    target: "0xdE5C871Fb0626562E9Acecc3c5b0EB12C298d8BC",
    eventAbi: "event RockPaperScissors_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] outcomes, uint8[] randomActions, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Slots (old + new)
  {
    target: "0xe3C0B41413Bc9913E0ace43a64637EF6C4e39F97",
    eventAbi: "event Slots_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] slotIDs, uint256[] multipliers, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  {
    target: "0x0badb8f24327074CF94d6398E1B722e201c0BBf0",
    eventAbi: "event Slots_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] slotIDs, uint256[] multipliers, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Mines (old + new)
  {
    target: "0x1CE656bD09a59A59513c4460220031d49038739e",
    eventAbi: "event Mines_End_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint256 numMines, bool[25] revealedTiles, uint256 multiplier )",
  },
  {
    target: "0xBF3727f9aee1140870AF3303fba52537536F8e5D",
    eventAbi: "event Mines_End_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint256 numMines, bool[25] revealedTiles, uint256 multiplier )",
  },
  // Plinko (old + new)
  {
    target: "0xf970b3C6A1bd7745A07B317543EA999e4E98666c",
    eventAbi: "event Plinko_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] paths, uint8 numRows, uint8 risk, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  {
    target: "0x33F906D6c6aA65fb3055f2028dc394033C3310F3",
    eventAbi: "event Plinko_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] paths, uint8 numRows, uint8 risk, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Video Poker (old + new)
  {
    target: "0x681D2C159EE77f660F5081a3c193fb9613b624C0",
    eventAbi: "event VideoPoker_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, (uint8,uint8)[5] playerHand, uint256 outcome, uint64 sequenceNumber, uint64 sequenceNumberStart )",
  },
  {
    target: "0xB3aFCc826F9dBF2A1a9F78a2ddDCD12517589267",
    eventAbi: "event VideoPoker_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, (uint8,uint8)[5] playerHand, uint256 outcome, uint64 sequenceNumber, uint64 sequenceNumberStart )",
  },
  // Baccarat (old + new)
  {
    target: "0xBEAaFcc7648354a0722350378bF2A295B9b946A8",
    eventAbi: "event Baccarat_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256[5] wager, uint256 totalPayout, address tokenAddress, (uint8,uint8)[6] playerHand, (uint8,uint8)[3] bankerCards, (uint8,uint8)[3] playerCards, uint256[3] outcome, uint256[5] payouts, uint64 sequenceNumber )",
  },
  {
    target: "0x49a3F93deDca36c7FA5Af695e89eEa0f03a1A11a",
    eventAbi: "event Baccarat_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256[5] wager, uint256 totalPayout, address tokenAddress, (uint8,uint8)[6] playerHand, (uint8,uint8)[3] bankerCards, (uint8,uint8)[3] playerCards, uint256[3] outcome, uint256[5] payouts, uint64 sequenceNumber )",
  },
  // Roulette (old + new)
  {
    target: "0x39AA4ECB48c52A018B2a1A700B89C4912FC39967",
    eventAbi: "event Roulette_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] rouletteType, uint256[] payouts, uint256 outcome, uint64 sequenceNumber )",
  },
  {
    target: "0xf485d6F84537bdf3A2096508652F9a6876975A8C",
    eventAbi: "event Roulette_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] rouletteType, uint256[] payouts, uint256 outcome, uint64 sequenceNumber )",
  },
  // Fish Prawn Crab (old + new)
  {
    target: "0xbB1b4eE5D22ca19faa5aA9A55Caf4abAEd14607B",
    eventAbi: "event FishPrawnCrab_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] fishPrawnCrabType, uint256[] payouts, uint256[3] outcome, uint64 sequenceNumber )",
  },
  {
    target: "0xbF34070fEEF2063277626904F7BF736D70826604",
    eventAbi: "event FishPrawnCrab_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] fishPrawnCrabType, uint256[] payouts, uint256[3] outcome, uint64 sequenceNumber )",
  },
  // Limbo (old + new)
  {
    target: "0x11B83A467AbFF4c466294af94B99ACEF3D85929d",
    eventAbi: "event Limbo_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, uint256[] limboOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  {
    target: "0xb0279eB0cD894f9964c1945D9543FD6fc5C929fE",
    eventAbi: "event Limbo_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, uint256[] limboOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },

  // ===== V3 contracts (oracle-secured redeployment, April 2026) =====

  // Coin Flip v3
  {
    target: "0x8c78813943b922Cf22C05d78b7111581CDe26470",
    eventAbi: "event CoinFlip_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] coinOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Range v3
  {
    target: "0x7d122332D2a8C101E04413ADcE65800E14FBE7CA",
    eventAbi: "event Range_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, bool isOver, uint256[] rangeOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Rock Paper Scissors v3
  {
    target: "0x17e16003642fadADD35D5932D99CDb5db440762c",
    eventAbi: "event RockPaperScissors_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] outcomes, uint8[] randomActions, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Slots v3
  {
    target: "0xC217163660b556290718F61BCB73709473ceFcFD",
    eventAbi: "event Slots_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] slotIDs, uint256[] multipliers, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Mines v3
  {
    target: "0x2AF15C945e0FaC4D11912f8BCCe527A1B6d6F5f0",
    eventAbi: "event Mines_End_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint256 numMines, bool[25] revealedTiles, uint256 multiplier )",
  },
  // Plinko v3
  {
    target: "0x9d0f00aCC5f3Cb1D78D074f6b6e630f29fE7fcB7",
    eventAbi: "event Plinko_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] paths, uint8 numRows, uint8 risk, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Video Poker v3
  {
    target: "0x028485Da1612602f5D3B41f1BB9B68d2Fcf32508",
    eventAbi: "event VideoPoker_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, (uint8,uint8)[5] playerHand, uint256 outcome, uint64 sequenceNumber, uint64 sequenceNumberStart )",
  },
  // Baccarat v3
  {
    target: "0x6EdCaA21083B97526EC388E26cEb9f4C2Cf118cC",
    eventAbi: "event Baccarat_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256[5] wager, uint256 totalPayout, address tokenAddress, (uint8,uint8)[6] playerHand, (uint8,uint8)[3] bankerCards, (uint8,uint8)[3] playerCards, uint256[3] outcome, uint256[5] payouts, uint64 sequenceNumber )",
  },
  // Roulette v3
  {
    target: "0xbc796462ebbb625dE027465fe004faFAAA893B18",
    eventAbi: "event Roulette_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] rouletteType, uint256[] payouts, uint256 outcome, uint64 sequenceNumber )",
  },
  // Fish Prawn Crab v3
  {
    target: "0x41E6675d9Ae2F9803ccF1DdeC81304fE256fE9c0",
    eventAbi: "event FishPrawnCrab_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] fishPrawnCrabType, uint256[] payouts, uint256[3] outcome, uint64 sequenceNumber )",
  },
  // Limbo v3
  {
    target: "0x87F70cC2492688675228D89BCA894f855A5dbF50",
    eventAbi: "event Limbo_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, uint256[] limboOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },

  // ===== V4 contracts (Pyth V2 + UUPS proxy, April 2026) =====

  // CoinFlip v4
  {
    target: "0xb82360d08784f0Ff24A740ADaD6b1AC2391C8D57",
    eventAbi: "event CoinFlip_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] coinOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Range v4
  {
    target: "0x0B1E533e33f9E82849E71fb5c0a33F38462D5eD4",
    eventAbi: "event Range_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, bool isOver, uint256[] rangeOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // RockPaperScissors v4
  {
    target: "0x843D62ad75F5d0b383f8520e23d19174b7961b8E",
    eventAbi: "event RockPaperScissors_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] outcomes, uint8[] randomActions, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Slots v4
  {
    target: "0xd6F08aF222C8aa69F99B6099F93C6d96897d378f",
    eventAbi: "event Slots_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] slotIDs, uint256[] multipliers, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Mines v4
  {
    target: "0x3014d056Db789984552084Db359D7C56A620549b",
    eventAbi: "event Mines_End_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint256 numMines, bool[25] revealedTiles, uint256 multiplier )",
  },
  // Plinko v4
  {
    target: "0x5859E2926750F3981f95bbA16b86d8e69cf4334B",
    eventAbi: "event Plinko_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] paths, uint8 numRows, uint8 risk, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // VideoPoker v4
  {
    target: "0xb86A1955E96147665d7bdd70E50bD6Af38E086d1",
    eventAbi: "event VideoPoker_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, (uint8,uint8)[5] playerHand, uint256 outcome, uint64 sequenceNumber, uint64 sequenceNumberStart )",
  },
  // Baccarat v4
  {
    target: "0x8261A173DC96e206b8D8621ca1231a3E7bcB851E",
    eventAbi: "event Baccarat_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256[5] wager, uint256 totalPayout, address tokenAddress, (uint8,uint8)[6] playerHand, (uint8,uint8)[3] bankerCards, (uint8,uint8)[3] playerCards, uint256[3] outcome, uint256[5] payouts, uint64 sequenceNumber )",
  },
  // Roulette v4
  {
    target: "0x4A050DD00c08856cc3d7C5BD152E4e601ffDaa35",
    eventAbi: "event Roulette_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] rouletteType, uint256[] payouts, uint256 outcome, uint64 sequenceNumber )",
  },
  // Limbo v4
  {
    target: "0xb9e0b5447B92eb5CF246693F7b533d5c84AA8dC5",
    eventAbi: "event Limbo_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, uint256[] limboOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // FishPrawnCrab v4
  {
    target: "0xbbE3FA39912355C49Aa3ccdD02C51d989Fb33E79",
    eventAbi: "event FishPrawnCrab_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256 totalPayout, address tokenAddress, uint256[] wager, uint256[] fishPrawnCrabType, uint256[] payouts, uint256[3] outcome, uint64 sequenceNumber )",
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
