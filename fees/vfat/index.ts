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
  sonic: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'sonic',
    fromBlockSickle: 1449481
  },
  fraxtal: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'fraxtal',
    fromBlockSickle: 13191747
  },
  avax: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'avax',
    fromBlockSickle: 52924795
  },
  ink: {
    factory: '0xc6013E57a0811C7111A8fB07ACd2E248D9489C99',
    chainName: 'ink',
    fromBlockSickle: 7174745
  },
  unichain: {
    factory: '0x233D9067677dCf1a161954D45B4C965B9d567168',
    chainName: 'unichain',
    fromBlockSickle: 10858337
  },
  katana: {
    factory: '0x233D9067677dCf1a161954D45B4C965B9d567168',
    chainName: 'katana',
    fromBlockSickle: 5297524
  },
  polygon: {
    factory: '0xAc371D6E651b6450ea8c4cE346Ddd44B62d851B5',
    chainName: 'polygon',
    fromBlockSickle: 70860185
  },
  lisk: {
    factory: '0x233D9067677dCf1a161954D45B4C965B9d567168',
    chainName: 'lisk',
    fromBlockSickle: 17528958
  },
};

const fetchFees = async (_t: any, _b: any, { createBalances, getLogs, chain }: FetchOptions) => {
  const dailyFees = createBalances();
  const settings = chainSettings[chain];

  // Fetch Deploy events to get all Sickle contract addresses
  const deployLogs = await getLogs({
    target: settings.factory,
    fromBlock: settings.fromBlock,
    eventAbi: 'event Deploy(address indexed admin, address sickle)',
    cacheInCloud: true,
  });

  const sickleContracts = deployLogs.map((log: any) => log.sickle.toLowerCase());
  const sickleContractsSet = new Set(sickleContracts);

  const logs = await getLogs({
    entireLog: true,
    parseLog: true,
    noTarget: true,
    eventAbi: 'event FeeCharged(bytes32 feesHash, uint256 amount, address token)',
  });

  const logs2 = await getLogs({
    entireLog: true,
    parseLog: true,
    noTarget: true,
    eventAbi: 'event FeeCharged(address strategy, bytes4 feeDescriptor, uint256 amount, address token)',
  });

  logs.forEach((log: any) => {
    let target = (log.address || log.source).toLowerCase();
    if (!sickleContractsSet.has(target)) return;
    const decodedLog = log.parsedLog.args
    dailyFees.add(decodedLog.token, decodedLog.amount);
  });

  logs2.forEach((log: any) => {
    let target = (log.address || log.source).toLowerCase();
    if (!sickleContractsSet.has(target)) return;
    const decodedLog = log.parsedLog.args
    dailyFees.add(decodedLog.token, decodedLog.amount);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const meta = {
  methodology: {
    Fees: 'All fees paid by users using vfat.io services.',
    Revenue: 'All fees collected by vfat.io.',
    ProtocolRevenue: 'All fees collected by vfat.io.',
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees,
      start: '2024-03-21',
      meta,
    },
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2024-03-21',
      meta,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: '2024-03-21',
      meta,
    },
    [CHAIN.LINEA]: {
      fetch: fetchFees,
      start: '2024-03-21',
      meta,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: '2024-03-21',
      meta,
    },
    [CHAIN.MODE]: {
      fetch: fetchFees,
      start: '2024-03-21',
      meta,
    },
    [CHAIN.FANTOM]: {
      fetch: fetchFees,
      start: '2024-03-21',
      meta,
    },
    [CHAIN.MANTLE]: {
      fetch: fetchFees,
      start: '2024-03-21',
      meta,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees,
      start: '2024-03-21',
      meta,
    },
    [CHAIN.SONIC]: {
      fetch: fetchFees,
      start: '2024-12-24',
      meta,
    },
    [CHAIN.FRAXTAL]: {
      fetch: fetchFees,
      start: '2024-12-03',
      meta,
    },
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: '2024-11-11',
      meta,
    },
    [CHAIN.INK]: {
      fetch: fetchFees,
      start: '2025-02-27',
      meta,
    },
    [CHAIN.UNICHAIN]: {
      fetch: fetchFees,
      start: '2025-03-10',
      meta,
    },
    [CHAIN.KATANA]: {
      fetch: fetchFees,
      start: '2025-06-09',
      meta,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2025-04-28',
      meta,
    },
    [CHAIN.LISK]: {
      fetch: fetchFees,
      start: '2025-06-13',
      meta,
    },
  }
}

export default adapter;
