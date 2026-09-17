import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { nullAddress } from "../../helpers/token";

const chainSettings: Record<string, { factory: string; fromBlock: number; chainName: string }> = {
  [CHAIN.BASE]: {
    factory: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31',
    fromBlock: 12116234,
    chainName: 'base',
  },
  [CHAIN.OPTIMISM]: {
    factory: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8',
    fromBlock: 117753454,
    chainName: 'optimism',
  },
  [CHAIN.ARBITRUM]: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    fromBlock: 197499243,
    chainName: 'arbitrum',
  },
  [CHAIN.LINEA]: {
    factory: '0x0F6aBc6B808B377d6AeD8dA1FAD5E135C99C81a3',
    fromBlock: 4949355,
    chainName: 'linea',
  },
  [CHAIN.ETHEREUM]: {
    factory: '0x9D70B9E5ac2862C405D64A0193b4A4757Aab7F95',
    chainName: 'ethereum',
    fromBlock: 19580798,
  },
  [CHAIN.MODE]: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'mode',
    fromBlock: 7464171,
  },
  [CHAIN.FANTOM]: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'fantom',
    fromBlock: 79166260,
  },
  [CHAIN.MANTLE]: {
    factory: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8',
    chainName: 'mantle',
    fromBlock: 62383980,
  },
  [CHAIN.BSC]: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'bsc',
    fromBlock: 37565801
  },
  [CHAIN.SONIC]: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'sonic',
    fromBlock: 1449481
  },
  [CHAIN.FRAXTAL]: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'fraxtal',
    fromBlock: 13191747
  },
  [CHAIN.AVAX]: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'avax',
    fromBlock: 52924795
  },
  [CHAIN.INK]: {
    factory: '0xc6013E57a0811C7111A8fB07ACd2E248D9489C99',
    chainName: 'ink',
    fromBlock: 7174745
  },
  [CHAIN.UNICHAIN]: {
    factory: '0x233D9067677dCf1a161954D45B4C965B9d567168',
    chainName: 'unichain',
    fromBlock: 10858337
  },
  [CHAIN.KATANA]: {
    factory: '0x233D9067677dCf1a161954D45B4C965B9d567168',
    chainName: 'katana',
    fromBlock: 5297524
  },
  [CHAIN.POLYGON]: {
    factory: '0xAc371D6E651b6450ea8c4cE346Ddd44B62d851B5',
    chainName: 'polygon',
    fromBlock: 70860185
  },
  [CHAIN.LISK]: {
    factory: '0x233D9067677dCf1a161954D45B4C965B9d567168',
    chainName: 'lisk',
    fromBlock: 17528958
  },
};

const fetchFees = async ({ createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyFees = createBalances();
  const settings = chainSettings[chain];

  let sickleContracts: string[] = [];
  if (chain !== CHAIN.BSC) {
    const deployLogs = await getLogs({
      target: settings.factory,
      fromBlock: settings.fromBlock,
      eventAbi: 'event Deploy(address indexed admin, address sickle)',
      cacheInCloud: true,
    });
    sickleContracts = deployLogs.map((log: any) => log.sickle.toLowerCase());
  }

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

  if (chain === CHAIN.BSC) {
    // BSC's deployment history exceeds public RPC log limits. Check only this
    // window's emitters against the factory's on-chain membership registry.
    const emitters: string[] = [...new Set([...logs, ...logs2].map(log => (log.address || log.source).toLowerCase()))];
    const admins = await api.multiCall({
      target: settings.factory,
      abi: 'function admins(address) view returns (address)',
      calls: emitters,
    });
    sickleContracts = emitters.filter((_, i) => admins[i] !== nullAddress);
  }
  const sickleContractsSet = new Set(sickleContracts);

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

const methodology = {
  Fees: 'All fees paid by users using vfat.io services.',
  Revenue: 'All fees collected by vfat.io.',
  ProtocolRevenue: 'All fees collected by vfat.io.',
}

const adapter: SimpleAdapter = {
  fetch: fetchFees,
  methodology,
  version: 2,
  pullHourly: true,
  chains: [
    [CHAIN.OPTIMISM, { start: '2024-03-21' }],
    [CHAIN.BASE, { start: '2024-03-21' }],
    [CHAIN.ARBITRUM, { start: '2024-03-21' }],
    [CHAIN.LINEA, { start: '2024-03-21' }],
    [CHAIN.ETHEREUM, { start: '2024-03-21' }],
    [CHAIN.MODE, { start: '2024-03-21' }],
    [CHAIN.FANTOM, { start: '2024-03-21' }],
    [CHAIN.MANTLE, { start: '2024-03-21' }],
    [CHAIN.BSC, { start: '2024-03-21' }],
    [CHAIN.SONIC, { start: '2024-12-24' }],
    [CHAIN.FRAXTAL, { start: '2024-12-03' }],
    [CHAIN.AVAX, { start: '2024-11-11' }],
    [CHAIN.INK, { start: '2025-02-27' }],
    [CHAIN.UNICHAIN, { start: '2025-03-10' }],
    [CHAIN.KATANA, { start: '2025-06-09' }],
    [CHAIN.POLYGON, { start: '2025-04-28' }],
    [CHAIN.LISK, { start: '2025-06-13' }],
  ],
}

export default adapter;
