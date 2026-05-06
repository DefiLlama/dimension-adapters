import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const WORLD_MINER = "0xbc25d77953425041C3f09ea4b731a873E00036EA";
const START_DATE = "2026-05-05";
const CONQUER_PAYMENTS = "Conquer payments";

const CONQUER_EVENT =
  "event Conquer(uint8 indexed continentId,address indexed newHolder,address indexed prevHolder,uint256 price,uint256 prevHolderPayout,uint256 tokensAccrued)";

function eventArg(log: any, name: string, index: number) {
  return log.args?.[name] ?? log.args?.[index] ?? log[name] ?? log[index];
}

function toBigInt(value: any): bigint {
  return BigInt(value?.toString?.() ?? value ?? 0);
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const conquerEvents = await options.getLogs({
    target: WORLD_MINER,
    eventAbi: CONQUER_EVENT,
    skipIndexer: true,
    skipCacheRead: true,
  });

  let dailyConquerVolume = 0n;

  for (const log of conquerEvents) {
    dailyConquerVolume += toBigInt(eventArg(log, "price", 3));
  }

  dailyFees.addGasToken(dailyConquerVolume, CONQUER_PAYMENTS);
  dailyUserFees.addGasToken(dailyConquerVolume, CONQUER_PAYMENTS);
  dailyRevenue.addGasToken(dailyConquerVolume, CONQUER_PAYMENTS);
  dailyProtocolRevenue.addGasToken(dailyConquerVolume, CONQUER_PAYMENTS);

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
}

const methodology = {
  Fees:
    "100% of ETH paid by users to conquer continents flows through Land Bid protocol contracts. This represents total Conquer payment volume facilitated by the protocol.",
  UserFees:
    "Users pay ETH to conquer continents. The full Conquer payment is counted as user fees under Land Bid's submitted methodology.",
  Revenue:
    "Same as Fees. The protocol receives 100% of Conquer payments and redistributes them according to game mechanics: 85% to previous holders as instant game payouts, 10% to protocol-owned Uniswap V3 liquidity, and 5% to team operations.",
  ProtocolRevenue:
    "Same as Revenue for Land Bid's submitted methodology. All Conquer payments are processed by protocol contracts before redistribution.",
};

const breakdownMethodology = {
  Fees: {
    [CONQUER_PAYMENTS]:
      "ETH paid by users when conquering continents in the Land Bid game.",
  },
  UserFees: {
    [CONQUER_PAYMENTS]:
      "ETH paid by users when conquering continents in the Land Bid game.",
  },
  Revenue: {
    [CONQUER_PAYMENTS]:
      "Conquer payments processed by Land Bid protocol contracts before redistribution according to game mechanics.",
  },
  ProtocolRevenue: {
    [CONQUER_PAYMENTS]:
      "Conquer payments processed by Land Bid protocol contracts before redistribution according to game mechanics.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: START_DATE,
  methodology,
  breakdownMethodology,
};

export default adapter;
