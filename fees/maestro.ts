import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, FetchOptions, } from "../adapters/types";
import { addTokensReceived, getSolanaReceived } from "../helpers/token";
import { queryIndexer } from "../helpers/indexer";

const meta = {
  methodology: {
    Fees: "All trading fees paid by users while using Maestro bot.",
    Revenue: "Trading fees are collected by Maestro protocol.",
    ProtocolRevenue: "Trading fees are collected by Maestro protocol.",
  }
}

const dispatcher: any = {
  [CHAIN.ETHEREUM]: "0x2ff99ee6b22aedaefd8fd12497e504b18983cb14",
  [CHAIN.BSC]: "0x7176456e98443a7000b44e09149a540d06733965",
  [CHAIN.ARBITRUM]: "0x34b5561c30a152b5882c8924973f19df698470f4",
  [CHAIN.BASE]: "0xb0999731f7c2581844658a9d2ced1be0077b7397",
  [CHAIN.TRON]: "TS4yvUzwmaSh4XM1scBXRgoKeVdb4oot4S"
}
const feesAddress = '0xB0999731f7c2581844658A9d2ced1be0077b7397'

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const dailyFees = options.createBalances()
  await addTokensReceived({ options, target: feesAddress, balances: dailyFees })
  const logs = await options.getLogs({ target: dispatcher[options.chain], eventAbi: 'event BalanceTransfer (address to, uint256 amount)', })
  logs.map((log: any) => dailyFees.addGasToken(log.amount))
  if (CHAIN.ETHEREUM === options.chain) {
    const eth_out: any = await queryIndexer(`
    SELECT
      sum("value") / 1e18 AS eth_out
    FROM
      ethereum.transactions
    WHERE
        from_address = '\\xB0999731f7c2581844658A9d2ced1be0077b7397'
        AND data = '\\x'
        AND block_time BETWEEN llama_replace_date_range;
    `, options);
    dailyFees.addGasToken(eth_out[0].eth_out * 1e18)
  }
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const fetchSolana: any = async (_timestamp: number, _1: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: ['MaestroUL88UBnZr3wfoN7hqmNWFi3ZYCGqZoJJHE36', 'FRMxAnZgkW58zbYcE7Bxqsg99VWpJh6sMP5xLzAWNabN'] })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}


const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-07-01', 
      meta
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2022-07-01', 
      meta
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2022-07-01', 
      meta
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2024-03-05',
      meta,
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-06-19', 
      meta
    },
    // [CHAIN.TRON]: {
    //   fetch,
    //   start: '2022-07-01', 
    //   meta
    // },
  },
  isExpensiveAdapter: true
}

export default adapter;
