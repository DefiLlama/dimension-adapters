import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";

const games = [
  // CoinFlip
  {
    target: "0xd9197Ac761FA45E2eD70b13D69A51A0D260730a3",
    eventAbi: "event CoinFlip_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] coinOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Range (Dice)
  {
    target: "0xeb04F70DA33713C6F40eCB0d3Ec95a780369C602",
    eventAbi: "event Range_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint32 multiplier, bool isOver, uint256[] rangeOutcomes, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Slots
  {
    target: "0x9aCccdE1D9Ff315aD6ed41Ae52D451D2fF7baf5b",
    eventAbi: "event Slots_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] slotIDs, uint256[] multipliers, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Plinko
  {
    target: "0x7ff7eA59C2aee61989440cAbE883e3f91B71C11c",
    eventAbi: "event Plinko_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint16[] paths, uint8 numRows, uint8 risk, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Rock Paper Scissors
  {
    target: "0xC216867c9bf0C60131c00d9139e17118E05B0989",
    eventAbi: "event RockPaperScissors_Outcome_Event( address indexed playerAddress, uint256 wager, uint256 payout, address tokenAddress, uint8[] outcomes, uint8[] randomActions, uint256[] payouts, uint32 numGames, uint64 sequenceNumber )",
  },
  // Baccarat
  {
    target: "0x1D6a92De0738044378C3338bDD02643b5c37044A",
    eventAbi: "event Baccarat_Outcome_Event( address indexed playerAddress, uint256 totalWager, uint256[5] wager, uint256 totalPayout, address tokenAddress, (uint8,uint8)[6] playerHand, (uint8,uint8)[3] bankerCards, (uint8,uint8)[3] playerCards, uint256[3] outcome, uint256[5] payouts, uint64 sequenceNumber )",
  },
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs: any[] = [];
  for (const game of games) {
    const gameLogs = await options.getLogs({
      target: game.target,
      eventAbi: game.eventAbi,
    });
    logs.push(...gameLogs);
  }

  for (const log of logs) {
    let wagerRaw: BigNumber;
    let payoutRaw: BigNumber;

    if ('totalWager' in log) {
      // Multi-wager games: Baccarat
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
    const ggr = wager - payout;

    dailyVolume.addCGToken('hyperliquid', wager);
    dailyFees.addCGToken('hyperliquid', ggr);
    dailyUserFees.addCGToken('hyperliquid', ggr);
    dailyRevenue.addCGToken('hyperliquid', ggr);
    dailyProtocolRevenue.addCGToken('hyperliquid', ggr);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2026-04-25',
  methodology: {
    Volume: 'Total wager amount placed across all 6 on-chain casino game contracts on HyperEVM.',
    Fees: 'Gross gaming revenue (GGR): total wagers minus total payouts. Can be negative on days when players win more than they wager.',
    UserFees: 'Same as Fees — represents the net cost to players.',
    Revenue: 'Same as Fees. All bankroll liquidity is protocol-owned, so 100% of GGR accrues to the protocol.',
    ProtocolRevenue: 'Same as Fees. The protocol is the sole bankroll liquidity provider.',
    SupplySideRevenue: 'Zero — there are no external liquidity providers; all bankroll is protocol-owned.',
  }
}

export default adapter;
