import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: ['F34kcgMgCF7mYWkwLN3WN7KrFprr2NbwxuLvXx4fbztj',
      '96aFQc9qyqpjMfqdUeurZVYRrrwPJG2uPV6pceu4B1yb',
      'BTQyUXhxiLrFPD5JUANCwg4ViibmNY39McmWk4bVNxLA',
      '4vfFG2xGZsjXQgA6ZCTzA1PgUGLppFHY9eGnh3ZVGUuz',
      'A7XTexV13EPnhtH55qhT7qmFkgYCMAMnfXk89VWu9PCJ',
      'GreGavLfh5sK1BeQ2WYvmk352wbyNNzQdCmqWCV8QSib']
  })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
