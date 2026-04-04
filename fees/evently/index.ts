import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// evently (formerly Megamble) — Prediction markets on MegaETH
// Domain: evently.market | X: @eventlymarket
// Chain: MegaETH Mainnet (ID 4326)

const CONTRACT_V2 = "0x7c56aa113be4a867936c55013b03387c7b9cd41a";

// V2: parimutuel pools — 5% total fee (3% treasury + 2% creator)
// Fees captured at settlement via MarketFinalized event
const MARKET_FINALIZED_V2 =
  "event MarketFinalized(uint256 indexed marketId, uint256 winningOption, uint256 totalPool, uint256 treasuryFee, uint256 creatorFee)";

// V2: volume via BetPlaced
const BET_PLACED_V2 =
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, uint256 optionIndex, uint256 amount, uint256 newOptionPool, uint256 newTotalPool)";

const fetch = async (options: FetchOptions) => {
  // --- Fees: sum treasuryFee + creatorFee from finalized markets ---
  const finalizedLogs = await options.getLogs({
    target: CONTRACT_V2,
    eventAbi: MARKET_FINALIZED_V2,
  });

  let dailyFees = options.createBalances();
  const USDM = "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7";

  for (const log of finalizedLogs) {
    const total =
      BigInt(log.treasuryFee.toString()) + BigInt(log.creatorFee.toString());
    dailyFees.add(USDM, total);
  }

  // --- Volume: sum bet amounts from BetPlaced ---
  const betLogs = await options.getLogs({
    target: CONTRACT_V2,
    eventAbi: BET_PLACED_V2,
  });

  let dailyVolume = options.createBalances();
  for (const log of betLogs) {
    dailyVolume.add(USDM, BigInt(log.amount.toString()));
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyVolume,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: "2025-03-01",
      meta: {
        methodology: {
          Fees:
            "5% of total pool at market finalization (3% treasury + 2% creator). Tracked via MarketFinalized event.",
          Revenue: "Same as Fees — all fees go to treasury and market creators.",
          Volume: "Sum of all bets placed on prediction markets (BetPlaced).",
        },
      },
    },
  },
};

export default adapter;
