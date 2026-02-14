// Aspecta BuildKey fee vault (multisig)
// This vault receives the 2.5% fee from every BuildKey trade
// Ref: https://docs.aspecta.ai/buildkey/fees-and-benefits

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";

const ASPECTA_FEE_COLLECTOR = "0x38799Ce388a9b65EC6bA7A47c1efb9cF1A7068e4";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const batchSize = 5000;
  const allLogs: any[] = [];
  let batchLogs: any[];
  let offset = 0;
  const fromBlock = (await options.getFromBlock()) - 200;
  const toBlock = (await options.getToBlock()) - 200;

  for (;;) {
    batchLogs = await sdk.indexer.getLogs({
      chain: options.chain,
      targets: [ASPECTA_FEE_COLLECTOR],
      topics: ['0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d'],
      onlyArgs: true,
      eventAbi: 'event SafeReceived (address indexed sender, uint256 value)',
      fromBlock,
      toBlock,
      limit: batchSize,
      offset,
      all: false
    });
    allLogs.push(...batchLogs);
    if (batchLogs.length < batchSize) break;
    offset += batchSize;
  }

  allLogs.forEach(log => {
    if (log.sender?.toLowerCase?.()) {
      dailyFees.addGasToken(log.value, "BuildKey trading fees");
    }
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const breakdownMethodology = {
  Fees: {
    "BuildKey trading fees": "2.5% fee charged on every BuildKey trade, paid in BNB by users",
  },
  UserFees: {
    "BuildKey trading fees": "2.5% fee charged on every BuildKey trade, paid in BNB by users",
  },
  Revenue: {
    "BuildKey trading fees": "All BuildKey trading fees are retained by the protocol",
  },
  ProtocolRevenue: {
    "BuildKey trading fees": "Protocol-controlled revenue from BuildKey trading fees",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: '2023-07-17',
  methodology: {
    Fees: "2.5% BuildKey trading fees paid in BNB by users.",
    Revenue: "All BuildKey trading fees collected by the protocol.",
    ProtocolRevenue: "Protocol-controlled revenue from BuildKey trades.",
  },
  breakdownMethodology,
};

export default adapter;
