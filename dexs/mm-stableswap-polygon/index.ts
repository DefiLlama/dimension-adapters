import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

export default {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: { fetch }
  }
}

async function fetch({ createBalances, api, getLogs, }: FetchOptions) {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const logs = await getLogs({
    target: '0x690BBaa9EDBb762542FD198763092eaB2B2A5350',
    eventAbi: 'event TokenSwap (address indexed buyer, uint256 tokensSold, uint256 tokensBought, uint128 soldId, uint128 boughtId)'
  })
  const tokens  =await api.multiCall({ target: '0x690BBaa9EDBb762542FD198763092eaB2B2A5350', abi: 'function getToken(uint8) view returns (address)' , calls: Array.from({length: 3}, (_, i) => i)})
  logs.forEach((log: any) => {
    dailyVolume.add(tokens[log.boughtId], log.tokensBought)
    dailyFees.add(tokens[log.boughtId], log.tokensBought * 0.0002)
  })

  return { dailyFees, dailyVolume }
}