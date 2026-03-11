import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const targetContract = '0xe220E8d200d3e433b8CFa06397275C03994A5123'

const fetchVolume = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances()
    const logs_sold = await options.getLogs({
        target: targetContract,
        eventAbi: 'event Sold(address seller, address token, uint256 ethOut, uint256 tokensIn, uint256 priceNew)'
    });
    const logs_bought = await options.getLogs({
        target: targetContract,
        eventAbi: 'event Bought(address buyer, address token, uint256 ethIn, uint256 tokensOut, uint256 priceNew)'
    });
    
    logs_sold.map((e: any) => {
        dailyVolume.addGasToken(e[2])
    });
    logs_bought.map((e: any) => {
        dailyVolume.addGasToken(e[2])
    });
  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SONIC]: {
      fetch: fetchVolume
    },
  },
}

export default adapter