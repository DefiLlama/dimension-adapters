import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import { routers } from "./kerberos/routers"

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options, targets: [
      '0x77777D91c0B8Ec9984a05302E4Ef041dcCf77FeE',
      '0xc8c0e780960f954c3426a32b6ab453248d632b59',
      '0x147CF09E7373B8FDA6f12021F1b0f98D6da1A566',
      '0x9c87bb379d5Ff2fCbf2F83e619f9fCcb95a40AD9'
    ], fromAdddesses: [...routers,
      '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' // lifi
    ]
  })

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
};

const info = {
  methodology: {
    Fees: "All fess paid by users while use extension.",
    Revenue: "All fess paid by users while use extension.",
    ProtocolRevenue: "All fess paid by users while use extension.",
  }
}

const start = 1712710800
const adapter: SimpleAdapter = {
  fetch, methodology: info.methodology,
  start,
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.POLYGON, CHAIN.BSC, CHAIN.OPTIMISM,],
  adapter: {},
};
export default adapter;
