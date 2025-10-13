import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, FetchOptions, } from "../adapters/types";
import { addTokensReceived, getETHReceived, getSolanaReceived } from "../helpers/token";

const dispatcher: any = {
  [CHAIN.ETHEREUM]: "0x2ff99ee6b22aedaefd8fd12497e504b18983cb14",
  [CHAIN.BSC]: "0x7176456e98443a7000b44e09149a540d06733965",
  [CHAIN.ARBITRUM]: "0x34b5561c30a152b5882c8924973f19df698470f4",
  [CHAIN.BASE]: "0x2CDF4CAdF2272B77475732446Ba664443277E8C1",
  [CHAIN.TRON]: "0xeabcabB91FC7191ecc2002FAc9e269C96d914BAB"
}

const feesAddress = '0xB0999731f7c2581844658A9d2ced1be0077b7397'
// const TONFeeAddress = 'TXNP92LYmnPZzqnXwwsmotizTcNyPGxxEv'

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const dailyFees = options.createBalances()
  // const have_dispatcher = Object.keys(dispatcher).includes(options.chain)

  // if (have_dispatcher) {
  //   const logs = await options.getLogs({ target: dispatcher[options.chain], eventAbi: 'event BalanceTransfer (address to, uint256 amount)', })
  //   logs.map((log: any) => dailyFees.addGasToken(log.amount))
  // } else {
  await addTokensReceived({ options, target: feesAddress, balances: dailyFees })
  await getETHReceived({ options, target: feesAddress, balances: dailyFees })
  // }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const fetchSolana: any = async (_timestamp: number, _1: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: ['MaestroUL88UBnZr3wfoN7hqmNWFi3ZYCGqZoJJHE36', 'FRMxAnZgkW58zbYcE7Bxqsg99VWpJh6sMP5xLzAWNabN'] })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const methodology = {
  Fees: "All trading fees paid by users while using Maestro bot.",
  Revenue: "Trading fees are collected by Maestro protocol.",
  ProtocolRevenue: "Trading fees are collected by Maestro protocol.",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2022-07-01', },
    [CHAIN.BSC]: { start: '2022-07-01', },
    [CHAIN.ARBITRUM]: { start: '2022-07-01', },
    [CHAIN.BASE]: { start: '2024-06-19', },
    [CHAIN.SONIC]: { start: '2025-02-26', },
    [CHAIN.AVAX]: { start: '2025-06-08', },
    [CHAIN.TRON]: { start: '2022-07-01', },
    // [CHAIN.HYPERLIQUID]: { start: '2025-05-27', },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2024-03-05',
    },
  },
  methodology,
  isExpensiveAdapter: true
}

export default adapter;
