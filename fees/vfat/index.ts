import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const factories: Record<string, string> = {
  [CHAIN.BASE]: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31',
  [CHAIN.OPTIMISM]: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8',
  [CHAIN.ARBITRUM]: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
  [CHAIN.LINEA]: '0x0F6aBc6B808B377d6AeD8dA1FAD5E135C99C81a3',
  [CHAIN.ETHEREUM]: '0x9D70B9E5ac2862C405D64A0193b4A4757Aab7F95',
  [CHAIN.MODE]: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
  [CHAIN.FANTOM]: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
  [CHAIN.MANTLE]: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8',
  [CHAIN.BSC]: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
  [CHAIN.SONIC]: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
  [CHAIN.FRAXTAL]: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
  [CHAIN.AVAX]: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
  [CHAIN.INK]: '0xc6013E57a0811C7111A8fB07ACd2E248D9489C99',
  [CHAIN.UNICHAIN]: '0x233D9067677dCf1a161954D45B4C965B9d567168',
  [CHAIN.KATANA]: '0x233D9067677dCf1a161954D45B4C965B9d567168',
  [CHAIN.POLYGON]: '0xAc371D6E651b6450ea8c4cE346Ddd44B62d851B5',
  [CHAIN.LISK]: '0x233D9067677dCf1a161954D45B4C965B9d567168',
};

const fetchFees = async ({ createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyFees = createBalances();

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

  // Validate only this window's emitters, without scanning factory history.
  const emitters: string[] = [...new Set([...logs, ...logs2].map(log => (log.address || log.source).toLowerCase()))];
  const admins = await api.multiCall({
    target: factories[chain],
    abi: 'function admins(address) view returns (address)',
    calls: emitters,
  });
  const sickles = await api.multiCall({
    target: factories[chain],
    abi: 'function sickles(address) view returns (address)',
    calls: admins,
  });
  // The reverse lookup also distinguishes an unknown emitter from a Sickle
  // whose admin is the zero address.
  const sickleContractsSet = new Set(emitters.filter((emitter, i) => sickles[i].toLowerCase() === emitter));

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
