import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addGasTokensReceived } from '../../helpers/token';

const feeReceiverMultisig = [
  "0x48735904455eda3aa9a0c9e43ee9999c795e30b9",
  "0x55d571b7475F4382C2a15D24A7C864cA679407c4",
  "0x60Be34554F193f4f6862b0E12DC16BA30163D6d0",
  "0x31120f443365efa63330d2D962f537aE28f0d672",
  "0xf89b36B36A634745eEFbbF17d5F777A494F8B6F7",
  "0xC1865A53609eaEC415b530632F43F4297392b224"
] // source: https://dune.com/queries/4068894/6851717

const fromAddresses = [
  "0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC",
  "0x5c952063c7fc8610FFDB798152D69F0B9550762b"
]

const fetch = async (options: FetchOptions) => {
  let dailyVolume = options.createBalances()

  await addGasTokensReceived({ multisigs: feeReceiverMultisig, balances: dailyVolume, options, fromAddresses })
  dailyVolume = dailyVolume.resizeBy(100) // because of 1% fixed platform fee as per docs

  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: 1735129946,
    },
  },
}

export default adapter
