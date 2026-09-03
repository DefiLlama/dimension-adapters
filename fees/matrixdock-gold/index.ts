import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

// Matrixdock XAUm sources:
// XAUm FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/gold-token-xaum/faq
// XAUm contract addresses: https://matrixdock.gitbook.io/matrixdock-docs/english/gold-token-xaum/smart-contract/contract-address
// XAUm mint/redeem transparency API: https://www.matrixdock.com/transparency/on-chain-transactions

// XAUm FAQ: redemption fee is 0.25%.
const REDEMPTION_FEE = 0.0025;
const API = "https://www.matrixdock.com/rwa/anon/website/api/v1/transparency/issue-redeem/list?symbol=XAUM";

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
  const records = await getRecords(options);
  for (const record of records) {
    const fee = Number(record.fine_weight) * REDEMPTION_FEE;
    dailyFees.addCGToken("pax-gold", fee, METRIC.MINT_REDEEM_FEES);
    dailyRevenue.addCGToken("pax-gold", fee, METRIC.MINT_REDEEM_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CHAIN_GLOBAL]: {
      fetch,
      start: "2024-08-27",
    },
  },
  methodology: {
    Fees: "XAUm redemption fees from Matrixdock's mint/redeem transparency records.",
    Revenue: "XAUm redemption fees accounted as protocol revenue.",
    ProtocolRevenue: "XAUm redemption fees accounted as protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: "0.25% fee charged on XAUm redemption orders across supported networks.",
    },
    Revenue: {
      [METRIC.MINT_REDEEM_FEES]: "0.25% XAUm redemption fee from Matrixdock mint/redeem transparency records.",
    },
    ProtocolRevenue: {
      [METRIC.MINT_REDEEM_FEES]: "XAUm redemption fee accounted as protocol revenue.",
    },
  },
};

export default adapter;
