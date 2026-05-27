import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics"

const contracts: Record<string, string> = {
  [CHAIN.BASE]: "0x282970F452371454332Ca522cE59F318a2C81484",
  [CHAIN.BSC]: "0xd270845b7EBb0B013DfCCD9cA782a57Bfb7A359A",
  [CHAIN.ETHEREUM]: "0x60943cb06b76A24431659165c81a03c16F1C325C",
}
const feeTopic = "0xc08acb1892d97145a15c4cc6206956e56a7482a9af175f548b7b40eb336790dd";

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances } = options;
  const dailyFees = createBalances();
  const contract = contracts[options.chain]
  const logs = await getLogs({ target: contract, topics: [feeTopic], entireLog: true });
  logs.forEach((log: any) => {
    const token = "0x" + log.topics[1].slice(26);
    const amount = BigInt(log.data);
    dailyFees.add(token, amount, METRIC.TRADING_FEES);
  });
  return { dailyFees, dailyRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-07-03",
    },
    [CHAIN.BSC]: {
      fetch,
      start: "2025-07-03",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-07-16"
    }
  },
  methodology: {
    Fees: "Fees collected on each swap (0.5% for chain wallets, 0.8% for bot wallets).",
    Revenue: "All fees are collected by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Fees collected on each swap (0.5% for chain wallets, 0.8% for bot wallets)."
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "All fees are collected by the protocol"
    }
  }
};

export default adapter;
