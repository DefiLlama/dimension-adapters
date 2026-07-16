import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// x402.miroshark.xyz — MiroShark's paid x402 API (https://www.miroshark.xyz/):
// multi-agent social simulation runs priced at $1.00 USDC per POST /run call.
//
// Payments settle on Base as gasless USDC transfers (EIP-3009
// transferWithAuthorization) submitted by x402 facilitators. Facilitator
// sender addresses rotate, so instead of a facilitator allowlist we identify
// x402 settlements structurally: the transaction is sent directly to the
// token contract (tx_to = contract_address) by someone other than the token
// sender ("from" != tx_from) — i.e. a gasless EIP-3009 settlement.
const RECEIVERS = [
  '0x6cab485fc28ec70d3845113b704d4824e4d2b24f', // payTo wallet (MiroShark deployer)
  '0x67976cebb5266b50a08c0dcb676e03baf305e3a2', // early payments landed here due to a payTo misconfiguration
];

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
    select
      CAST(contract_address as varchar) as token,
      SUM(amount_raw) as revenue
    from tokens.transfers
    where blockchain = 'base'
      and "to" IN (${RECEIVERS.join(', ')})
      and tx_to = contract_address
      and "from" != tx_from
      and "from" != "to"
      and TIME_RANGE
    group by contract_address
  `);
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const results = options.preFetchedResults || [];
  results.forEach((row: { token: string; revenue: string }) => dailyFees.add(row.token, row.revenue));

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  chains: [CHAIN.BASE],
  dependencies: [Dependencies.DUNE],
  start: '2026-04-01',
  methodology: {
    Fees: 'API usage fees paid by users of the x402.miroshark.xyz simulation API ($1.00 USDC per simulation run), settled on Base via x402 (gasless EIP-3009 USDC transfers submitted by x402 facilitators).',
    Revenue: 'All API fees accrue to MiroShark — there is no supply side and facilitators charge no on-chain cut.',
    ProtocolRevenue: 'All API fees accrue to MiroShark.',
  },
};

export default adapter;
