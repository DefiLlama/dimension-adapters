import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { CHAIN } from "../helpers/chains";

// stellar.expert's ledger-stats `accounts` is the live account count, so its daily difference nets out
// account_merge deletions and goes negative on mass-merge days. Count account creations instead:
// the account_created effect is emitted only by a successful create_account operation.
const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const query = `
    select count(distinct address) as new_users
    from stellar.history_effects
    where closed_at_date = date '${options.dateString}'
      and type_string = 'account_created'
  `;

  const [row] = await queryDuneSql(options, query);

  return {
    dailyNewUsers: Number(row.new_users),
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
    NewUsers: "Distinct Stellar accounts created by a successful create_account operation during the UTC day. Accounts deleted and later re-created are counted again on the day they are re-created.",
  },
};

export default adapter;
