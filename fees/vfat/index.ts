import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const chainConfig: Record<string, { factory: string; start: string; maxBlockRange?: number }> = {
  [CHAIN.BASE]: { factory: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31', start: '2024-03-21' },
  [CHAIN.OPTIMISM]: { factory: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8', start: '2024-03-21' },
  [CHAIN.ARBITRUM]: { factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf', start: '2024-03-21' },
  [CHAIN.LINEA]: { factory: '0x0F6aBc6B808B377d6AeD8dA1FAD5E135C99C81a3', start: '2024-03-21' },
  [CHAIN.ETHEREUM]: { factory: '0x9D70B9E5ac2862C405D64A0193b4A4757Aab7F95', start: '2024-03-21' },
  [CHAIN.MODE]: { factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf', start: '2024-03-21' },
  [CHAIN.FANTOM]: { factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf', start: '2024-03-21' },
  [CHAIN.MANTLE]: { factory: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8', start: '2024-03-21' },
  [CHAIN.BSC]: { factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf', start: '2024-03-21' },
  [CHAIN.SONIC]: { factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf', start: '2024-12-24' },
  [CHAIN.FRAXTAL]: { factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf', start: '2024-12-03' },
  [CHAIN.AVAX]: { factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf', start: '2024-11-11' },
  [CHAIN.INK]: { factory: '0xc6013E57a0811C7111A8fB07ACd2E248D9489C99', start: '2025-02-27' },
  [CHAIN.UNICHAIN]: { factory: '0x233D9067677dCf1a161954D45B4C965B9d567168', start: '2025-03-10' },
  [CHAIN.KATANA]: { factory: '0x233D9067677dCf1a161954D45B4C965B9d567168', start: '2025-06-09' },
  [CHAIN.POLYGON]: { factory: '0xAc371D6E651b6450ea8c4cE346Ddd44B62d851B5', start: '2025-04-28' },
  [CHAIN.LISK]: { factory: '0x233D9067677dCf1a161954D45B4C965B9d567168', start: '2025-06-13' },
  // Start the new chains one day before their first fee: the hourly runner
  // checks eligibility against the start of a full 24-hour window.
 // [CHAIN.CRONOS]: { factory: '0x53d9780dbd3831e3a797fd215be4131636cd5fdf', start: '2025-09-18' },
  [CHAIN.MONAD]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2025-11-24' },
  [CHAIN.PULSECHAIN]: { factory: '0x06b559fef135ed5c9133478a2af502d8d44d59b5', start: '2025-09-04' },
  [CHAIN.WC]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2025-10-06' },
  [CHAIN.BOT_CHAIN]: { factory: '0x3575aa02ae85d8cd2aae6dcaa5d8750cfc9622e6', start: '2026-08-25' },
  [CHAIN.HYPERLIQUID]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2025-05-25' },
  [CHAIN.METAL]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2025-06-12' },
  [CHAIN.SONEIUM]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2025-06-12' },
  [CHAIN.PEAQ]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2026-06-14' },
  [CHAIN.TEMPO]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2026-08-20' },
  [CHAIN.MEGAETH]: { factory: '0xc6013e57a0811c7111a8fb07acd2e248d9489c99', start: '2026-04-20' },
  [CHAIN.ROBINHOOD]: { factory: '0x3575aa02ae85d8cd2aae6dcaa5d8750cfc9622e6', start: '2026-07-10' },
  [CHAIN.ARC]: { factory: '0x36f89be8cef366a97129c7d18cfcaf860ba9ff7c', start: '2026-09-15' },
  [CHAIN.ZETA]: { factory: '0x53d9780dbd3831e3a797fd215be4131636cd5fdf', start: '2025-08-14' },
  [CHAIN.PLASMA]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2025-09-25' },
  [CHAIN.CELO]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2025-08-08' },
  // Etherlink allows 500 blocks; the SDK adds 10 cache-padding blocks at each end.
  [CHAIN.ETHERLINK]: { factory: '0x233d9067677dcf1a161954d45b4c965b9d567168', start: '2025-10-28', maxBlockRange: 480 },
  [CHAIN.HEMI]: { factory: '0xc6013e57a0811c7111a8fb07acd2e248d9489c99', start: '2025-05-09' },
  [CHAIN.BERACHAIN]: { factory: '0x3575aa02ae85d8cd2aae6dcaa5d8750cfc9622e6', start: '2025-10-18' },
  [CHAIN.SCROLL]: { factory: '0x8e5ad312483fb369d8a5e724cb50e5b5b3228865', start: '2024-11-10' },
};


const fetchFees = async (options: FetchOptions) => {
  const { createBalances, getLogs, getFromBlock, getToBlock, chain } = options;
  const dailyFees = createBalances();
  const result = { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };

  const logs = await getLogs({
    maxBlockRange: chainConfig[chain].maxBlockRange,
    entireLog: true,
    parseLog: true,
    noTarget: true,
    eventAbi: 'event FeeCharged(bytes32 feesHash, uint256 amount, address token)',
  });

  const logs2 = await getLogs({
    maxBlockRange: chainConfig[chain].maxBlockRange,
    entireLog: true,
    parseLog: true,
    noTarget: true,
    eventAbi: 'event FeeCharged(address strategy, bytes4 feeDescriptor, uint256 amount, address token)',
  });

  // Validate only this window's emitters, without scanning factory history.
  const emitters: string[] = [...new Set([...logs, ...logs2].map(log => (log.address || log.source).toLowerCase()))];
  // Factory membership is permanent: records are only created on deployment
  // or copied from the immutable previousFactory. Only fee logs need history.
  const admins = await options.api.multiCall({
    target: chainConfig[chain].factory,
    abi: 'function admins(address) view returns (address)',
    calls: emitters,
  });
  const sickles = await options.api.multiCall({
    target: chainConfig[chain].factory,
    abi: 'function sickles(address) view returns (address)',
    calls: admins,
  });
  // The reverse lookup also distinguishes an unknown emitter from a Sickle
  // whose admin is the zero address.
  const sickleContractsSet = new Set(emitters.filter((emitter, i) => sickles[i].toLowerCase() === emitter));

  for (const log of [...logs, ...logs2]) {
    const target = (log.address || log.source).toLowerCase();
    if (!sickleContractsSet.has(target)) continue;
    const { token, amount } = log.parsedLog.args;
    // FeesLib uses this sentinel for native currency; SDK pricing uses zero.
    if (token.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') dailyFees.addGasToken(amount, METRIC.SERVICE_FEES);
    else dailyFees.add(token, amount, METRIC.SERVICE_FEES);
  }

  return result;
};

const methodology = {
  Fees: 'All fees paid by users using vfat.io services.',
  Revenue: 'All servuce fees collected by vfat.io.',
  ProtocolRevenue: 'All service fees collected by vfat.io.',
}

const breakdownMethodology = {
  Fees: { [METRIC.SERVICE_FEES]: 'Fees paid by users for vfat.io Sickle services.' },
  Revenue: { [METRIC.SERVICE_FEES]: 'Fees paid by users for vfat.io Sickle services, collected by vfat.io.' },
  ProtocolRevenue: { [METRIC.SERVICE_FEES]: 'Fees paid by users for vfat.io Sickle services, collected by vfat.io.' },
}

const adapter: SimpleAdapter = {
  fetch: fetchFees,
  methodology,
  breakdownMethodology,
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
}

export default adapter;
