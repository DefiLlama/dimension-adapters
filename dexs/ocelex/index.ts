import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";
import { Balances } from "@defillama/sdk";

const poolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)'

const config = {
  isAlgebraV2: true,
  swapEvent,
  poolCreatedEvent,
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
}

const OCX = "0x1a51b19ce03dbe0cb44c1528e34a7edd7771e9af";
const bveOCX = "0xe8a4c9b6a2b79fd844c9e3adbc8dc841eece557b";

const event_reward_added =
  "event RewardAdded(address indexed rewardToken,uint256 reward,uint256 startTimestamp)";
const event_gauge_created =
  "event GaugeCreated(address indexed gauge, address creator,address internal_bribe,address indexed external_bribe,address indexed pool)";

export const fees_bribes = async ({
  getLogs,
  createBalances,
  getToBlock,
}: FetchOptions): Promise<Balances> => {
  const voter = "0x426bD5345B024a7E70CdEc62886417Ec715e78B5";
  const dailyFees = createBalances();
  const logs_geuge_created = await getLogs({
    target: voter,
    fromBlock: 2207763,
    toBlock: await getToBlock(),
    eventAbi: event_gauge_created,
    cacheInCloud: true,
  });
  const bribes_contract: string[] = logs_geuge_created.map((e: any) =>
    e.external_bribe.toLowerCase()
  );

  const logs = await getLogs({
    targets: bribes_contract,
    eventAbi: event_reward_added,
  });
  logs.map((e: any) => {
    if (e.rewardToken.toLowerCase() === bveOCX) dailyFees.add(OCX, e.reward);
    else dailyFees.add(e.rewardToken, e.reward);
  });
  return dailyFees;
};

const fetch = async (options: FetchOptions) => {
  const adapter = getUniV3LogAdapter({ factory: '0x03057ae6294292b299a1863420edD65e0197AFEf', ...config })
  const otherMetrics = await adapter(options)
  const bribes = await fees_bribes(options)

  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  dailyFees.add(otherMetrics.dailyFees, 'Token Swap Fees')
  dailyFees.add(bribes, 'Bribes Rewards')
  
  dailySupplySideRevenue.add(otherMetrics.dailyFees, 'Token Swap Fees To LPs')
  dailySupplySideRevenue.add(bribes, 'Bribes Rewards To Voters')
  
  return {
    ...otherMetrics,
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'Users pay dynamic fees per swap plus bribes rewards deposited for Ocelex gauges.',
    UserFees: 'Users pay dynamic fees per swap plus bribes rewards deposited for Ocelex gauges.',
    Revenue: 'No protocol revenue.',
    ProtocolRevenue: 'No protocol revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs plus bribes rewards distributed to voters.',
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Dynamic swap fees paid by users on Ocelex pools.',
      'Bribes Rewards': 'Bribes rewards deposited into Ocelex external bribe contracts.',
    },
    UserFees: {
      'Token Swap Fees': 'Dynamic swap fees paid by users on Ocelex pools.',
      'Bribes Rewards': 'Bribes rewards deposited into Ocelex external bribe contracts.',
    },
    SupplySideRevenue: {
      'Token Swap Fees To LPs': 'Swap fees distributed to Ocelex LPs.',
      'Bribes Rewards To Voters': 'Bribes rewards distributed to Ocelex voters.',
    },
  },
  adapter: {
    [CHAIN.ZIRCUIT]: { fetch, start: '2024-09-27' },
  },
}

export default adapter;
