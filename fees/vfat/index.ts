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
    arbitrum: {
      factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
      fromBlockSickle: 197499243,
      chainName: 'arbitrum',
    },
    linea: {
      factory: '0x0F6aBc6B808B377d6AeD8dA1FAD5E135C99C81a3',
      fromBlockSickle: 4949355,
      chainName: 'linea',
    },
    ethereum: {
      factory: '0x9D70B9E5ac2862C405D64A0193b4A4757Aab7F95',
      chainName: 'ethereum',
      fromBlockSickle: 19580798,
    },
    mode: {
      factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
      chainName: 'mode',
      fromBlockSickle: 7464171,
    },
    fantom: {
      factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
      chainName: 'fantom',
      fromBlockSickle: 79166260,
    },
    mantle: {
      factory: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8',
      chainName: 'mantle',
      fromBlockSickle: 62383980,
    },
    bsc: {
      factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
      chainName: 'bsc',
      fromBlockSickle: 37565801
    },
  };

  const fetchFees = async ({ createBalances, getLogs, chain }: FetchOptions) => {
    const dailyFees = createBalances();
    const settings = chainSettings[chain];


/*     // Fetch Deploy events to get all Sickle contract addresses
    const deployLogs = await getLogs({
      target: settings.factory,
      fromBlock: settings.fromBlock,
      eventAbi: 'event Deploy(address indexed admin, address sickle)',
      cacheInCloud: true,
    });

    const sickleContracts = deployLogs.map((log: any) => log.sickle); */

    const logs = await getLogs({
      // targets: sickleContracts,
      eventAbi: 'event FeeCharged(bytes32 feesHash, uint256 amount, address token)',
    });

    const logs2 = await getLogs({
      // targets: sickleContracts,
      eventAbi: 'event FeeCharged(address strategy, bytes4 feeDescriptor, uint256 amount, address token)',
    });


    logs.forEach((log: any) => {
      dailyFees.add(log.token, log.amount);
    });

    logs2.forEach((log: any) => {
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
        start: '2024-03-21',
      },
      [CHAIN.BASE]: {
        fetch: fetchFees,
        start: '2024-03-21',
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetchFees,
        start: '2024-03-21',
      },
      [CHAIN.LINEA]: {
        fetch: fetchFees,
        start: '2024-03-21',
      },
      [CHAIN.ETHEREUM]: {
        fetch: fetchFees,
        start: '2024-03-21',
      },
      [CHAIN.MODE]: {
        fetch: fetchFees,
        start: '2024-03-21',
      },
      [CHAIN.FANTOM]: {
        fetch: fetchFees,
        start: '2024-03-21',
      },
      [CHAIN.MANTLE]: {
        fetch: fetchFees,
        start: '2024-03-21',
      },
      [CHAIN.BSC]: {
        fetch: fetchFees,
        start: '2024-03-21',
      },
    }
  }

  export default adapter;
