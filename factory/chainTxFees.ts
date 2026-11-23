import { fetchChainTransactionFeesExport, fetchTransactionFees, getOneDayFees } from "../helpers/getChainFees";
import { CHAIN } from "../helpers/chains";
import { fetchEvmChainMetricsFromOptions } from "../helpers/evmChainFees";
import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import { createFactoryExports } from "./registry";

// EVM chains read from Allium; all transaction fees count as revenue
const alliumFeesConfigs: Record<string, { chain: CHAIN; start: string }> = {
  "berachain": { chain: CHAIN.BERACHAIN, start: "2025-02-05" },
  "core": { chain: CHAIN.CORE, start: "2023-04-19" },
  "fraxtal": { chain: CHAIN.FRAXTAL, start: "2025-02-05" },
  "linea": { chain: CHAIN.LINEA, start: "2025-02-05" },
  // "ronin": moved to fees/ronin.ts: an OP Stack rollup since 2026-05-12, revenue nets out its Ethereum batch and proposal costs
  // "sonic": moved to fees/sonic.ts: burns burntFeeShare and half the FeeM residual, the rest goes to FeeM apps and validators
  "xlayer": { chain: CHAIN.XLAYER, start: "2024-03-30" },
};

// EVM chains read from Allium that burn nothing: every transaction fee is paid out to the block producers
type ValidatorFeesConfig = {
  chain: CHAIN;
  start: string;
  rpcFrom?: string; // windows starting on or after this date sum RPC receipts instead of Allium
  supplySideLabel: string;
  methodology: Record<string, string>;
  breakdownMethodology: Record<string, Record<string, string>>;
};

const alliumValidatorFeesConfigs: Record<string, ValidatorFeesConfig> = {
  "fantom": {
    chain: CHAIN.FANTOM, start: '2020-09-02',
    // Allium fantom.raw.transactions stopped at 2026-10-21 17:59 UTC (block 123771716) while the chain kept producing blocks.
    // RPC receipts matched Allium to the wei on 2026-10-20 10:00-11:00 UTC (459 txs).
    rpcFrom: '2026-10-21',
    supplySideLabel: 'Transaction Gas Fees To Validators',
    methodology: {
      Fees: 'Transaction fees paid by users for executing transactions on Fantom Opera.',
      SupplySideRevenue: 'Transaction fees distributed to validators. Fantom does not burn gas fees.',
      Revenue: 'Fantom does not retain transaction fees; all gas fees are paid to validators.',
    },
    breakdownMethodology: {
      Fees: { [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on Fantom Opera.' },
      SupplySideRevenue: { 'Transaction Gas Fees To Validators': 'Gas fees distributed to validators for securing the network.' },
    },
  },
  "xdc": {
    chain: CHAIN.XDC, start: '2019-06-01',
    supplySideLabel: 'Transaction Gas Fees To Masternode Operators',
    methodology: {
      Fees: 'Transaction fees paid by users for executing transactions on the XDC Network.',
      SupplySideRevenue: 'Transaction fees distributed to masternode operators. XDC does not burn gas fees.',
      Revenue: 'XDC does not retain transaction fees; all gas fees are paid to masternode operators.',
    },
    breakdownMethodology: {
      Fees: { [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on the XDC Network.' },
      SupplySideRevenue: { 'Transaction Gas Fees To Masternode Operators': 'Gas fees distributed to masternode operators for validating transactions.' },
    },
  },
};

function validatorFeesExport({ chain, start, rpcFrom, supplySideLabel, methodology, breakdownMethodology }: ValidatorFeesConfig): SimpleAdapter {
  const rpcFromTimestamp = rpcFrom ? Date.parse(rpcFrom) / 1000 : Infinity;

  const fetchFees = async (options: FetchOptions) => {
    if (options.startTimestamp < rpcFromTimestamp) return fetchTransactionFees(options);
    const { totalFeesWei } = await fetchEvmChainMetricsFromOptions(options, { chain, blockChunkSize: 500 });
    const dailyFees = options.createBalances();
    dailyFees.addGasToken(totalFeesWei.toString(), METRIC.TRANSACTION_GAS_FEES);
    return dailyFees;
  };

  return {
    version: 2,
    pullHourly: true,
    chains: [chain],
    start,
    protocolType: ProtocolType.CHAIN,
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    methodology,
    breakdownMethodology,
    fetch: async (options: FetchOptions) => {
      const dailyFees = await fetchFees(options);
      return { dailyFees, dailySupplySideRevenue: dailyFees.clone(1, supplySideLabel) };
    },
  };
}

// Non-EVM chains: the day's total fees in the native coin from CoinMetrics (FeeTotNtv), priced by CoinGecko id.
// No protocol revenue: the fees go to miners / validators.
const coinMetricsFeesConfigs: Record<string, { chain: CHAIN; assetId: string; cgId: string; start: string }> = {
  "bitcoin": { chain: CHAIN.BITCOIN, assetId: 'btc', cgId: 'bitcoin', start: '2009-01-03' },
  "bitcoin-cash": { chain: CHAIN.BITCOIN_CASH, assetId: 'bch', cgId: 'bitcoin-cash', start: '2017-08-01' },
  "doge": { chain: CHAIN.DOGE, assetId: 'doge', cgId: 'dogecoin', start: '2013-12-08' },
  "monero": { chain: CHAIN.MONERO, assetId: 'xmr', cgId: 'monero', start: '2014-04-18' },
  "ripple": { chain: CHAIN.RIPPLE, assetId: 'xrp', cgId: 'ripple', start: '2012-06-01' }, // Ripple launched in 2012, approximate launch date
};

function coinMetricsFeesExport({ chain, assetId, cgId, start }: { chain: CHAIN; assetId: string; cgId: string; start: string }): SimpleAdapter {
  return {
    version: 1,
    adapter: {
      [chain]: {
        fetch: async (options: FetchOptions) => {
          const today = new Date(getTimestampAtStartOfDayUTC(options.toTimestamp) * 1000).toISOString();
          const yesterday = new Date(getTimestampAtStartOfPreviousDayUTC(options.toTimestamp) * 1000).toISOString();
          const fees = await getOneDayFees(assetId, yesterday, today);
          const dailyFees = options.createBalances();
          dailyFees.addCGToken(cgId, fees);
          return { dailyFees, dailyRevenue: 0 };
        },
        start,
      },
    },
    protocolType: ProtocolType.CHAIN,
  };
}

const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(alliumFeesConfigs)) {
  feesProtocols[name] = fetchChainTransactionFeesExport(config);
}
for (const [name, config] of Object.entries(alliumValidatorFeesConfigs)) {
  feesProtocols[name] = validatorFeesExport(config);
}
for (const [name, config] of Object.entries(coinMetricsFeesConfigs)) {
  feesProtocols[name] = coinMetricsFeesExport(config);
}

export const { protocolList, getAdapter } = createFactoryExports(feesProtocols);
