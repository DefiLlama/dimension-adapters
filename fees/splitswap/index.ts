import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

// SplitSwap fee wallet (inbound transfers represent collected fees)
const FEE_WALLET = "4ZEwVcgnTPbhD16HS2Ln9KXdt9pfTokECTBbhoRPCMHj";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    select
      coalesce(sum(amount_usd), 0) as fees_usd
    from tokens_solana.transfers
    where action = 'transfer'
      and to_owner = '${FEE_WALLET}'
      AND TIME_RANGE
  `;

  const res = await queryDuneSql(options, query);
  const feesUsd = Number(res?.[0]?.fees_usd ?? 0);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(feesUsd);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2025-12-15",
  isExpensiveAdapter: true,
  methodology: {
    Fees: "0.05-0.5% fee on deposits and withdrawals.",
    Revenue: "30% referral fee, 70% protocol revenue.",
    ProtocolRevenue: "70% of fees collected. ",
  },
};

export default adapter;

