import request from "graphql-request"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const url = 'https://api.mondrianswap.xyz/graphql'


interface IProtocolData {
  swapVolume24h: number
  swapFee24h: number
}
const fetchVolume = async (options: FetchOptions) => {
  const querry = `
  {
    embrGetProtocolData{
      swapVolume24h
      swapFee24h

    }
  }`

  const respose = (await request(url, querry)).embrGetProtocolData as IProtocolData

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(Number(respose.swapVolume24h))
  const dailyFees = dailyVolume.clone();
  dailyFees.addUSDValue(Number(respose.swapFee24h))
  return {
    dailyVolume: dailyVolume,
    dailyFees: dailyFees,
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ABSTRACT]: {
      fetch: fetchVolume,
      runAtCurrTime: true
    }
  }
}

export default adapters
