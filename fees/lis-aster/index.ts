import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

/**
 * lisAster — Lista DAO's ASTER yield aggregator on BSC.
 *
 * AsterRewards.notifyRewards(amount) emits RewardsNotified(asterAmount, fee, net):
 *   - asterAmount: total ASTER rewards for the round (asterAmount = fee + net)
 *   - fee:         Lista DAO's cut (feeRate on the rewards), transferred to feeReceiver
 *   - net:         distributed to lisAster stakers
 *
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lis-aster
 */

const ASTER_REWARDS = "0x935e18a52e24746ff7b4d307012d8a82c2ab5a23";
const ASTER = "0x000ae314e2a2172a039b26378814c252734f556a"; // ASTER token on BSC
const REWARDS_NOTIFIED_ABI =
  "event RewardsNotified(uint256 asterAmount, uint256 fee, uint256 net)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: ASTER_REWARDS,
    eventAbi: REWARDS_NOTIFIED_ABI,
  });

  logs.forEach((log) => {
    // Total rewards = staker yield (net) + protocol fee
    dailySupplySideRevenue.add(ASTER, log.net, METRIC.ASSETS_YIELDS);
    dailyRevenue.add(ASTER, log.fee, METRIC.PERFORMANCE_FEES);
    dailyFees.add(ASTER, log.net, METRIC.ASSETS_YIELDS);
    dailyFees.add(ASTER, log.fee, METRIC.PERFORMANCE_FEES);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total ASTER staking rewards distributed through the lisAster aggregator.",
  Revenue: "Performance fee that Lista DAO takes on the ASTER staking rewards.",
  ProtocolRevenue: "Performance fee that Lista DAO takes on the ASTER staking rewards.",
  SupplySideRevenue: "ASTER rewards distributed to lisAster stakers, net of the protocol fee.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2026-05-21",
    },
  },
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "ASTER rewards distributed to lisAster stakers",
      [METRIC.PERFORMANCE_FEES]: "Performance fee taken by Lista DAO on ASTER rewards",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "Performance fee taken by Lista DAO on ASTER rewards",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "Performance fee taken by Lista DAO on ASTER rewards",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "ASTER rewards paid to stakers, net of the protocol fee",
    },
  },
};

export default adapter;
