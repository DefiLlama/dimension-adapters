import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  PFWA_EVENTS, PFWA_MARKET_FACTORIES, PFWA_PROTOCOL_WALLETS, PfwaBuyArgs, PfwaClaimArgs, PfwaSellArgs, getPfwaMarketTokens, getPfwaTokenLogs,
} from "../helpers/pfwa-markets";

// PFWA Markets (https://pfwa.fun): prediction markets on Robinhood Chain. Users are the wallets that bought or sold an
// outcome token, claimed winnings, or created a market, read from the outcome tokens' and factories' events
// (contracts: helpers/pfwa-markets.ts). PFWA's own wallets (team, market seeder, market-making agent) are excluded.
const MARKET_CREATED = "event MarketCreated(uint256 indexed marketId, uint8 indexed marketType, string name, uint256 expirationTime, address creator, address[] optionTokens)";

const fetch = async (options: FetchOptions) => {
  const tokens = await getPfwaMarketTokens(options);
  const [buys, sells, claims, creations] = await Promise.all([
    getPfwaTokenLogs<PfwaBuyArgs>(options, PFWA_EVENTS.buy, tokens),
    getPfwaTokenLogs<PfwaSellArgs>(options, PFWA_EVENTS.sell, tokens),
    getPfwaTokenLogs<PfwaClaimArgs>(options, PFWA_EVENTS.claim, tokens),
    options.getLogs({ targets: PFWA_MARKET_FACTORIES.map(({ factory }) => factory), eventAbi: MARKET_CREATED, onlyArgs: false }),
  ]);

  const users = new Set<string>();
  const transactions = new Set<string>();
  const add = (user: string, tx: string) => {
    const address = String(user).toLowerCase();
    if (PFWA_PROTOCOL_WALLETS.has(address)) return;
    users.add(address);
    transactions.add(String(tx).toLowerCase());
  };
  for (const log of buys) add(log.args.buyer, log.transactionHash);
  for (const log of sells) add(log.args.seller, log.transactionHash);
  for (const log of claims) add(log.args.claimant, log.transactionHash);
  for (const log of creations) add(log.args.creator, log.transactionHash);

  return { dailyActiveUsers: users.size, dailyTransactionsCount: transactions.size };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-31",
  methodology: {
    ActiveUsers: "Unique wallets that bought or sold an outcome token, claimed winnings or created a market on PFWA Markets during the day, excluding PFWA's own wallets.",
    TransactionsCount: "Transactions with at least one of those actions.",
  },
};

export default adapter;
