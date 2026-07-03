import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { queryAllium } from "../../helpers/allium";

// SplitSwap fee wallet (inbound transfers represent collected fees)
const FEE_WALLET = "4ZEwVcgnTPbhD16HS2Ln9KXdt9pfTokECTBbhoRPCMHj";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const query = `
    select
      coalesce(sum(usd_amount), 0) as fees_usd
    from solana.assets.transfers
    where transfer_type in ('sol_transfer', 'spl_token_transfer')
      and to_address = '${FEE_WALLET}'
      and block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      and block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const res = await queryAllium(query);
  const feesUsd = Number(res?.[0]?.fees_usd ?? 0);

  dailyFees.addUSDValue(feesUsd, METRIC.DEPOSIT_WITHDRAW_FEES)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  dependencies: [Dependencies.ALLIUM],
  chains: [CHAIN.SOLANA],
  start: "2025-12-15",
  isExpensiveAdapter: true,
  pullHourly: true,
  methodology: {
    Fees: "0.05-0.5% fee on deposits and withdrawals.",
    Revenue: "0.05-0.5% fee on deposits and withdrawals.",
    ProtocolRevenue: "0.05-0.5% fee on deposits and withdrawals.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.05-0.5% fee on deposits and withdrawals.",
    },
    Revenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.05-0.5% fee on deposits and withdrawals.",
    },
    ProtocolRevenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.05-0.5% fee on deposits and withdrawals.",
    },
  },
};

export default adapter;

