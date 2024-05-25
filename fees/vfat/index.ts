import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainSettings: any = {
    base: {
      factory: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31',
      fromBlock: 12116234,
      chainName: 'base',
    },
    optimism: {
      factory: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8',
      fromBlock: 117753454,
      chainName: 'optimism',
    },
  };

  const fetchFees = async ({ createBalances, getLogs, chain }: FetchOptions) => {
    const dailyFees = createBalances();
    const settings = chainSettings[chain];


    // Fetch Deploy events to get all Sickle contract addresses
    const deployLogs = await getLogs({
      target: settings.factory,
      fromBlock: settings.fromBlock,
      eventAbi: 'event Deploy(address indexed admin, address sickle)',
    });

    const sickleContracts = deployLogs.map((log: any) => log.sickle);

    const logs = await getLogs({
      targets: sickleContracts,
      eventAbi: 'event FeeCharged(bytes32 feesHash, uint256 amount, address token)',
    });

    logs.forEach((log: any) => {
      dailyFees.add(log.token, log.amount);
    });

    return {
      dailyFees,
      dailyRevenue: dailyFees,
  };
  };

  const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
      [CHAIN.OPTIMISM]: {
        fetch: fetchFees,
        start: 1710979200,
      },
      [CHAIN.BASE]: {
        fetch: fetchFees,
        start: 1710979200,
      },
    }
  }

  export default adapter;
