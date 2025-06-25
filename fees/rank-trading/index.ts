import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi = {
  "functions": {
    "factorySettings": "function factorySettings() view returns (address asset, address assetPriceFeed, address rankToken, address ranktokenPricePair, address backendAddress, address managedAddress, address rankStakingPool, uint256 rankStakingPoolId, uint256 premiumStakingValue, tuple(uint16 depositFeeBP, uint16 performanceFeeBP, uint16 ownerDepositFeeBP), uint256 MAX_DURATION, bool enabled)",
    "rankStrategiesCount": "function rankStrategiesCount() view returns (uint256)",
    "rankStrategies": "function rankStrategies(uint256) view returns (address)"
  },
  "events": {
    "Pay": "event Pay(address indexed payer, address asset, uint256 amount, address destination, bytes32 paymentID)",
    "RankStrategyCreated": "event RankStrategyCreated(address indexed creator, address rankStrategy, uint256 RANcost, uint256 initialDeposit, uint256 platformFee, uint256 RANprice)",
    "InvestRequest": "event InvestRequest(address indexed user, address indexed creator, uint256 amount, uint256 creatorFee, uint256 platformFee, address indexed _referral)",
    "UnlockConfirm": "event UnlockConfirm(address indexed user, uint256 shares, uint256 assetAmount, uint256 assetProfit, uint256 creatorPerformanceFee, uint256 platformPerformanceFee, uint256 assetLoss)"
  }
};

const RANK_FACTORY_CONTRACTS: Record<string, string[]> = {
  [CHAIN.BSC]: [
    "0x6E9d30690E433503d3dB7001610f60290a286a3f",
    "0x7cD6ead7e0834Ae8bc393bA4c933Bb9e80e7dC19"
  ],
  [CHAIN.MODE]: [
    // Add MODE chain contracts when available
  ]
};

const fetch = async (options: FetchOptions) => {
  const { api, chain } = options;
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  
  const rankFactoryContracts = RANK_FACTORY_CONTRACTS[chain] || [];
  if (rankFactoryContracts.length === 0) {
    return { 
      dailyFees, 
      dailyRevenue: dailyProtocolRevenue, 
      dailyProtocolRevenue, 
      dailyUserFees: dailyFees 
    };
  }

  // Parallel fetch of factory settings and strategies count
  const [factorySettings, rankStrategiesCounts, payLogs] = await Promise.all([
    api.multiCall({
      abi: abi.functions.factorySettings,
      calls: rankFactoryContracts,
      permitFailure: true,
    }),
    api.multiCall({
      abi: abi.functions.rankStrategiesCount,
      calls: rankFactoryContracts,
      permitFailure: true,
    }),
    options.getLogs({
      targets: rankFactoryContracts,
      eventAbi: abi.events.Pay,
    })
  ]);

  payLogs.forEach((log: any) => {
    dailyFees.add(log.asset, log.amount);
  });

  const factoryPromises = rankFactoryContracts.map(async (rankFactoryContract, i) => {
    const token = factorySettings[i]?.asset;
    const rankToken = factorySettings[i]?.rankToken;
    const rankStrategiesCount = rankStrategiesCounts[i];

    if (!token || !rankToken) return;

    const logPromises = [
      options.getLogs({
        target: rankFactoryContract,
        eventAbi: abi.events.RankStrategyCreated,
      })
    ];

    let strategyContractsPromise: Promise<string[]> = Promise.resolve([]);
    if (rankStrategiesCount && rankStrategiesCount > 0) {
      strategyContractsPromise = api.multiCall({
        abi: abi.functions.rankStrategies,
        target: rankFactoryContract,
        calls: Array.from({ length: rankStrategiesCount }, (_, i) => ({ params: [i] })),
      });
    }

    const [rankStrategyCreatedLogs, rankStrategyContracts] = await Promise.all([
      logPromises[0],
      strategyContractsPromise
    ]);

    rankStrategyCreatedLogs.forEach((log: any) => {
      dailyFees.add(rankToken, log.RANcost);
      dailyFees.add(token, log.platformFee);
      dailyProtocolRevenue.add(token, log.platformFee);
    });

    if (rankStrategyContracts.length > 0) {
      const [investRequestLogs, unlockConfirmLogs] = await Promise.all([
        options.getLogs({
          targets: rankStrategyContracts,
          eventAbi: abi.events.InvestRequest,
        }),
        options.getLogs({
          targets: rankStrategyContracts,
          eventAbi: abi.events.UnlockConfirm,
        })
      ]);

      investRequestLogs.forEach((log: any) => {
        dailyFees.add(token, Number(log.creatorFee));
        dailyFees.add(token, Number(log.platformFee));
        dailyProtocolRevenue.add(token, Number(log.platformFee));
      });

      unlockConfirmLogs.forEach((log: any) => {
        dailyFees.add(token, Number(log.creatorPerformanceFee));
        dailyFees.add(token, Number(log.platformPerformanceFee));
        dailyProtocolRevenue.add(token, Number(log.platformPerformanceFee));
      });
    }
  });

  await Promise.all(factoryPromises);

  return { 
    dailyFees, 
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-04-07",
      meta: {
        methodology: {
          Fees: "Total fees collected from all Rank Factory and Strategy contracts, including platform fees, creator fees, performance fees, RAN token costs, and general service payments.",
          UserFees: "Same as total fees - represents all fees paid by users across the platform including strategy creation, investments, performance fees, and service payments.",
          Revenue: "Platform revenue only - fees earned by the protocol from strategy creation, investment processing, and performance-based earnings.",
          ProtocolRevenue: "Same as Revenue - represents the platform's share of fees from Rank Factory strategy creation fees, investment platform fees, and performance-based platform fees.",
        },
      },
    },
    [CHAIN.MODE]: {
      fetch,
      start: "2025-04-07", 
      meta: {
        methodology: {
          Fees: "Total fees collected from all Rank Factory and Strategy contracts, including platform fees, creator fees, performance fees, RAN token costs, and general service payments.",
          UserFees: "Same as total fees - represents all fees paid by users across the platform including strategy creation, investments, performance fees, and service payments.",
          Revenue: "Platform revenue only - fees earned by the protocol from strategy creation, investment processing, and performance-based earnings.",
          ProtocolRevenue: "Same as Revenue - represents the platform's share of fees from Rank Factory strategy creation fees, investment platform fees, and performance-based platform fees.",
        },
      },
    },
  },
};

export default adapter;
