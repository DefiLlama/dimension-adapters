import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (_: any, _1: any, options: FetchOptions) => {
  const targets = [
    'F34kcgMgCF7mYWkwLN3WN7KrFprr2NbwxuLvXx4fbztj',
    '96aFQc9qyqpjMfqdUeurZVYRrrwPJG2uPV6pceu4B1yb',
    'BTQyUXhxiLrFPD5JUANCwg4ViibmNY39McmWk4bVNxLA',
    '4vfFG2xGZsjXQgA6ZCTzA1PgUGLppFHY9eGnh3ZVGUuz',
    'A7XTexV13EPnhtH55qhT7qmFkgYCMAMnfXk89VWu9PCJ',
    'GreGavLfh5sK1BeQ2WYvmk352wbyNNzQdCmqWCV8QSib'

    // older addresses I think
    // 'HEPL5rTb6n1Ax6jt9z2XMPFJcDe9bSWvWQpsK7AMcbZg',
    // 'K1LRSA1DSoKBtC5DkcvnermRQ62YxogWSCZZPWQrdG5',
  ]
  const dailyFees = await getSolanaReceived({ options, targets })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'All trading fees paid by users for using Sol Trading Bot.',
    Revenue: 'Fees collected by Sol Trading Bot protocol.',
    ProtocolRevenue: 'Fees collected by Sol Trading Bot protocol.',
  }
};

export default adapter;
