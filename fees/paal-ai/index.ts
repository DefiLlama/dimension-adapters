import { Adapter, FetchOptions, } from "../../adapters/types";
import { queryIndexer } from "../../helpers/indexer";
import { getTokenDiff } from "../../helpers/token";
import {METRIC} from "../../helpers/metrics";

/** Address to check = paalecosystemfund.eth */
const CONTRACT_ECOSYSTEM_FUND = "0x54821d1B461aa887D37c449F3ace8dddDFCb8C0a";
const CONTRACT_STAKING = "0x85e253162C7e97275b703980F6b6fA8c0469D624";

const fetch = async (options: FetchOptions) => {
  // any funds on the CONTRACT_ECOSYSTEM_FUND is revenue
  const dailyRevenue = options.createBalances();
  await getTokenDiff({ target: CONTRACT_ECOSYSTEM_FUND, options, includeGasToken: true, balances: dailyRevenue, })
  const transactions = await queryIndexer(`
    SELECT
      block_number,
      block_time,
      "value" as eth_value,
      encode(transaction_hash, 'hex') AS HASH,
      encode(to_address, 'hex') AS to_address
    FROM
      ethereum.traces
    WHERE
      block_number > 17539904
      and to_address = '\\x54821d1B461aa887D37c449F3ace8dddDFCb8C0a'
      and error is null
      AND block_time BETWEEN llama_replace_date_range;
      `, options);

  transactions.map((transaction: any) => dailyRevenue.addGasToken(transaction.eth_value))

  const dailyFees = dailyRevenue.clone();
  const dailyHoldersRevenue = options.createBalances();
  // track Eth distribution to stakers
  const transferEvents = await options.getLogs({
      target: CONTRACT_STAKING,
      eventAbi: 'event DistributeReward(address indexed user, uint256 amount, bool _wasCompounded)',
  });
    transferEvents.forEach((log: any) => {
        dailyHoldersRevenue.addGasToken(log.amount, METRIC.TRADING_FEES);
    });
    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue
    }
}

const info = {
  methodology: {
    Fees: "Fees paid by users for using PAAL AI services.",
    HoldersRevenue: "50% of certain earnings are allocated to stakers",
  }
}
/** Adapter */
const adapter: Adapter = {
  version: 2,
  methodology: info.methodology,
  adapter: {
    ethereum: {
      fetch,
      start: '2023-07-23',
    },
  },
}

export default adapter;
