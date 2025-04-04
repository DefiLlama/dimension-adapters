import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';

const fees = {
  [CHAIN.ETHEREUM]: {
    tokens: [ADDRESSES.ethereum.USDT, ADDRESSES.ethereum.STETH, ADDRESSES.ethereum.CRVUSD, ADDRESSES.ethereum.CRV,
             "0x57B96D4aF698605563A4653D882635da59Bf11AF"], //RCH
    collectors: ["0x4140AB4AFc36B93270a9659BD8387660cC6509b5", "0x322665298cFa800518D4Ef7919893b59514BA9D1"],
    start: 1717679579,
  },
  [CHAIN.ARBITRUM]: {
    tokens: [ADDRESSES.arbitrum.USDT, ADDRESSES.arbitrum.USDC_CIRCLE],
    collectors: ["0x4Bd6bE959897631fbE5a8Aae01707219850e032f"],
    start: 	1717665701,
  },
  [CHAIN.BSC]: {
    tokens: [ADDRESSES.bsc.USDT],
    collectors: ["0xEC722a53Efee08ebFF8d2C61622991a33705fA79"],
    start: 	1726038205,
  },
  [CHAIN.POLYGON]: {
    tokens: [ADDRESSES.polygon.USDT],
    collectors: ["0x6a7F97eD710A162cf5F1Eb8024e613FC9Ce9d563"],
    start: 1733383076,
  },
  [CHAIN.SEI]: {
    tokens: ["0x6aB5d5E96aC59f66baB57450275cc16961219796"], //sUSDa
    collectors: ["0x6a7F97eD710A162cf5F1Eb8024e613FC9Ce9d563"],
    start: 1739963336,
  },
}

const fetch: any = async (options: FetchOptions) => {
  const chain = options.chain as keyof typeof fees;
  const dailyFees = await addTokensReceived({
    options,
    tokens: fees[chain].tokens,
    targets: fees[chain].collectors
  })
  return { dailyFees }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: fees[CHAIN.ETHEREUM].start,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: fees[CHAIN.ARBITRUM].start,
    },
    [CHAIN.BSC]: {
      fetch: fetch,
      start: fees[CHAIN.BSC].start,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: fees[CHAIN.POLYGON].start,
    },
    // [CHAIN.SEI]: {
    //   fetch: fetch,
    //   start: fees[CHAIN.SEI].start,
    // },
  },
} as SimpleAdapter;
