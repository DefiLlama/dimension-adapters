import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { CHAIN } from "../helpers/chains";

// stellar.expert's ledger-stats started answering 402 in November 2026, asking for an x402 payment of
// 0.1 USDC per request, so the same two counts are taken from Dune's copy of the ledger. stellar.expert's
// `transactions` were successful transactions only (its explorer plots them as "Successful Transactions"
// next to a separate `failed_transactions`), and it counted as active only the accounts that initiate
// activity, not the ones that only receive. The source account of a successful transaction matches both.
const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const query = `
    select
      count(distinct account) as active_users,
      count(*) as transactions
    from stellar.history_transactions
    where closed_at_date = date '${options.dateString}'
      and successful
  `;

  const [row] = await queryDuneSql(options, query);
  if (!Number(row?.transactions)) throw new Error(`No Stellar transactions on Dune for ${options.dateString}`);

  return {
    dailyActiveUsers: Number(row.active_users),
    dailyTransactionsCount: Number(row.transactions),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STELLAR],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2015-10-01",
  methodology: {
    ActiveUsers: "Distinct Stellar accounts that were the source account of at least one successful transaction during the UTC day. Accounts that only receive payments are not counted.",
    TransactionsCount: "Successful Stellar transactions during the UTC day. Failed transactions are not counted.",
  },
};

export default adapter;
