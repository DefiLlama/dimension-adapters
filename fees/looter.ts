// sol 3Pu1V4duyLyVpAJue1kLAfr74nGjQ3JDzj3aJjnoEXuL
// eth 0xF268035F5F7Fa5BD43Eb8b84723D880Ec2748D81 eth revi
// avax 0xE85a3c0B4cad610975e337f6309AAF49c4a224c3
// fantom 0xE85a3c0B4cad610975e337f6309AAF49c4a224c3
// base 0xe111b0c3605adc45cfb0cd75e5543f63cc3ec425

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived, getSolanaReceived } from "../helpers/token";

const contract: any = {
  [CHAIN.SOLANA]: '3Pu1V4duyLyVpAJue1kLAfr74nGjQ3JDzj3aJjnoEXuL',
  [CHAIN.ETHEREUM]: '0xF268035F5F7Fa5BD43Eb8b84723D880Ec2748D81',
  // [CHAIN.AVAX]: '0xE85a3c0B4cad610975e337f6309AAF49c4a224c3',
  // [CHAIN.FANTOM]: '0xE85a3c0B4cad610975e337f6309AAF49c4a224c3',
  [CHAIN.BASE]: '0xe111b0c3605adc45cfb0cd75e5543f63cc3ec425',
}


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  if (options.chain === CHAIN.SOLANA) {
    await getSolanaReceived({ options, target: contract[options.chain], balances: dailyFees })
  } else {
    await getETHReceived({ options, target: contract[options.chain], balances: dailyFees })
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const methodology = {
  Fees: "All trading fees paid by users while using Looter bot.",
  Revenue: "Trading fees are collected by Looter protocol.",
  ProtocolRevenue: "Trading fees are collected by Looter protocol.",
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-06-01', },
    [CHAIN.SOLANA]: { start: '2023-06-01', },
    // [CHAIN.AVAX]: { start: '2023-06-01', },
    // [CHAIN.FANTOM]: { start: '2023-06-01', },
    [CHAIN.BASE]: { start: '2023-06-01', },
  },
  isExpensiveAdapter: true,
};

export default adapter
