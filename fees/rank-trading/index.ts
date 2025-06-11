import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import abi from "./abi.json";

const _rankFactoryContracts = [
  { chain: CHAIN.BSC, address: "0x6E9d30690E433503d3dB7001610f60290a286a3f" },
  { chain: CHAIN.BSC, address: "0x7cD6ead7e0834Ae8bc393bA4c933Bb9e80e7dC19" },
];

const fetch = async (options: FetchOptions) => {
  const { api, chain } = options;
  const dailyFees = options.createBalances();
  const rankFactoryContracts = _rankFactoryContracts
    .filter((contract) => contract.chain === chain)
    .map((contract) => contract.address);
  if (rankFactoryContracts.length === 0) {
    return { dailyFees, dailyRevenue: dailyFees };
  }

  const factorySettings = await api.multiCall({
    abi: abi.functions.factorySettings,
    calls: rankFactoryContracts,
    permitFailure: true,
  });
  const tokens = factorySettings.map((f) => f?.asset);
  const rankTokens = factorySettings.map((f) => f?.rankToken);
  const rankStrategiesCounts = await api.multiCall({
    abi: abi.functions.rankStrategiesCount,
    calls: rankFactoryContracts,
    permitFailure: true,
  });

  const _pay: any[] = await options.getLogs({
    targets: rankFactoryContracts,
    eventAbi: abi.events.Pay,
  });
  _pay.forEach((log: any) => {
    dailyFees.add(log.asset, log.amount);
  });

  for (let i = 0; i < rankFactoryContracts.length; i++) {
    const rankFactoryContract = rankFactoryContracts[i];
    const token = tokens[i];
    const rankToken = rankTokens[i];
    const rankStrategiesCount = rankStrategiesCounts[i];

    const _rankStrategyCreated: any[] = await options.getLogs({
      target: rankFactoryContract,
      eventAbi: abi.events.RankStrategyCreated,
    });
    _rankStrategyCreated.forEach((log: any) => {
      dailyFees.add(rankToken, log.RANcost);
      dailyFees.add(token, log.platformFee);
    });

    if (!rankStrategiesCount || rankStrategiesCount == 0) continue;

    const rankStrategyContracts = await api.multiCall({
      abi: abi.functions.rankStrategies,
      target: rankFactoryContract,
      calls: Array.from({ length: rankStrategiesCount }, (_, i) => ({
        params: [i],
      })),
    });

    const _investRequest: any[] = await options.getLogs({
      targets: rankStrategyContracts,
      eventAbi: abi.events.InvestRequest,
    });
    _investRequest.forEach((log: any) => {
      dailyFees.add(token, log.creatorFee);
      dailyFees.add(token, log.platformFee);
    });

    const _unlockConfirm: any[] = await options.getLogs({
      targets: rankStrategyContracts,
      eventAbi: abi.events.UnlockConfirm,
    });
    _unlockConfirm.forEach((log: any) => {
      dailyFees.add(token, log.creatorPerformanceFee);
      dailyFees.add(token, log.platformPerformanceFee);
    });
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-04-07",
    },
    [CHAIN.MODE]: {
      fetch,
      start: "2025-04-07",
    },
  },
};

export default adapter;
