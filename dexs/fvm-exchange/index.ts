import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const blacklist_tokens = ['0xB8a32897016C1B2ee0797090162eAFe58f032795']
const customLogic = async ({ dailyVolume, }: any) => {
  for (const token of blacklist_tokens) {
    dailyVolume.removeTokenBalance(token)
  }
  return {
    dailyVolume,
  };
}

export default uniV2Exports({
  [CHAIN.FANTOM]: {
    factory: '0x472f3C3c9608fe0aE8d702f3f8A2d12c410C881A',
    customLogic
  },
}, { runAsV1: true })
