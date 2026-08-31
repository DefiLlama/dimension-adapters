import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

// Matrixdock XAGm sources:
// XAGm FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/faq
// XAGm token design / FRS fee model: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/token-design
// XAGm mint/redeem transparency API: https://www.matrixdock.com/transparency/on-chain-transactions

const CG_TOKEN = "matrixdock-silver";
const API = "https://www.matrixdock.com/rwa/anon/website/api/v1/transparency/issue-redeem/list?symbol=XAGM";
const REDEMPTION_FEE = 0.005;
const chainConfig = {
  [CHAIN.CHAIN_GLOBAL]: { start: "2026-03-09" },
  [CHAIN.ETHEREUM]: { start: "2026-03-09", xagm: "0x123ffe0a3C62878dcbee2742227dc8990058d9E1" },
};

const getRecords = async (options: FetchOptions) => {
  const items = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await httpGet(`${API}&offset=${offset}&limit=1000`);
    for (const record of data.items) {
      const timestamp = record.tx_time / 1000;
      if (timestamp < options.fromTimestamp) return items;
      if (record.record_type === "REDEEM" && timestamp < options.toTimestamp) items.push(record);
    }
    if (offset + data.items.length >= data.total) return items;
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (options.chain === CHAIN.CHAIN_GLOBAL) {
    const records = await getRecords(options);
    for (const record of records) {
      const fee = Number(record.fine_weight) * REDEMPTION_FEE;
      dailyFees.addCGToken(CG_TOKEN, fee, METRIC.MINT_REDEEM_FEES);
      dailyRevenue.addCGToken(CG_TOKEN, fee, METRIC.MINT_REDEEM_FEES);
    }
  }

  if (options.chain === CHAIN.ETHEREUM) {
    const logs = await options.getLogs({
      target: chainConfig[CHAIN.ETHEREUM].xagm,
      eventAbi: "event ReconcileSupply(uint64 lastReconcileTime, uint64 thisReconcileTime, uint256 amount)",
      fromBlock: await options.getFromBlock(),
    });
    for (const log of logs) {
      const fee = Number(log.amount) / 1e9;
      dailyFees.addCGToken(CG_TOKEN, fee, METRIC.MANAGEMENT_FEES);
      dailyRevenue.addCGToken(CG_TOKEN, fee, METRIC.MANAGEMENT_FEES);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: "XAGm custody fees and redemption fees.",
    Revenue: "XAGm custody and redemption fees accounted as protocol revenue.",
    ProtocolRevenue: "XAGm custody and redemption fees accounted as protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MANAGEMENT_FEES]: "XAGm custody fees from Ethereum ReconcileSupply events, which mint fee tokens covering the global token obligation across all chains.",
      [METRIC.MINT_REDEEM_FEES]: "0.50% fee charged on XAGm redemption orders from Matrixdock mint/redeem transparency records.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "XAGm custody fees accounted as protocol revenue.",
      [METRIC.MINT_REDEEM_FEES]: "XAGm redemption fee accounted as protocol revenue.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: "XAGm custody fees accounted as protocol revenue.",
      [METRIC.MINT_REDEEM_FEES]: "XAGm redemption fee accounted as protocol revenue.",
    },
  },
};

export default adapter;
