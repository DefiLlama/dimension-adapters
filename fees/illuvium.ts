import { Adapter, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';
import { addTokensReceived } from '../helpers/token';

type ChainConfig = {
  collectors: string[];
  start: string;
  skipIndexer: boolean;
}

// Verified Illuvium revenue wallets; deprecated Fuel Exchange and REVDIS distribution wallets are excluded.
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.IMMUTABLEX]: {
    collectors: [
      "0x9989818AE063f715a857925E419bA4B65b793d99",
      "0xBB7d2d46352AD21e4Dfc07dB90C9Bd1ec2dBb177",
    ],
    start: '2026-02-09',
    skipIndexer: true,
  },
  [CHAIN.ETHEREUM]: {
    collectors: [
      "0xBB7d2d46352AD21e4Dfc07dB90C9Bd1ec2dBb177",
    ],
    start: '2025-03-26',
    skipIndexer: false,
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const config = chainConfig[options.chain]
  const collectorSet = new Set(config.collectors?.map(address => address.toLowerCase()))
  const inflows = await addTokensReceived({
    options,
    targets: config.collectors,
    skipIndexer: config.skipIndexer,
    logFilter: (log) => !collectorSet.has(String(log.from ?? log.fromAddress ?? log.sender ?? '').toLowerCase()),
  })

  dailyFees.add(inflows, METRIC.SERVICE_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology: {
    Fees: "External ERC20 transfers into verified Illuvium Vault revenue wallets on Immutable zkEVM, plus ERC20 transfers and net native ETH inflow into the verified Unified Fuel revenue wallet on Ethereum.",
    Revenue: "Tracked Vault and Unified Fuel inflows are protocol revenue.",
    ProtocolRevenue: "Tracked Vault and Unified Fuel inflows are protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SERVICE_FEES]: "External transfers into verified Illuvium Vault and Unified Fuel revenue wallets.",
    },
    Revenue: {
      [METRIC.SERVICE_FEES]: "Tracked Vault and Unified Fuel inflows retained by the protocol.",
    },
    ProtocolRevenue: {
      [METRIC.SERVICE_FEES]: "Tracked Vault and Unified Fuel inflows retained by the protocol",
    },
  },
}

export default adapter;
