import { Adapter } from "../adapters/types";
import {ARBITRUM, AVAX, BSC, FANTOM, OPTIMISM} from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

enum CHAIN_ID {
  ARB = 42161,
  BSC = 56,
  FTM = 250,
  AVALANCHE = 43114,
  OPTIMISM = 10,
}

interface FeesMetaBaseData {
  fee: number
  chain_id: number
  total_fee: number
}

const feesDataEndpoint = 'https://app.mux.network/metabase/api/public/dashboard/a8bbcebe-3ad6-40c0-8afa-0140366024fe/dashcard/150/card/113'
const porDataEndpoint = 'https://app.mux.network/metabase/api/public/dashboard/a8bbcebe-3ad6-40c0-8afa-0140366024fe/dashcard/151/card/115'

const formatMetaBaseData = (cols: Array<any>, rows: Array<Array<any>>) => {
  const keys = cols.map((col) => {
    return col.display_name
  })
  return rows.map((row) => {
    const obj: any = {}
    row.map((item, index) => {
      obj[keys[index]] = item
    })
    return obj
  })
}

const formatDate = (date: number) => {
  return date < 10 ? `0${date}` : `${date}`
}

const computeRevenue = (fee: number, por: number) => {
  // fee × 70% × POR: Allocate for veMUX holders (in ETH)
  // fee × 30%: Purchase MUXLP and add as protocol-owned liquidity
  return (fee * 0.7 * por) + (fee * 0.3)
}

const computeHoldersRevenue = (fee: number, por: number) => {
  // fee × 70% × POR: Allocate for veMUX holders (in ETH)
  return fee * 0.7 * por
}

const computeProtocolRevenue = (fee: number) => {
  // fee × 30%: Purchase MUXLP and add as protocol-owned liquidity
  return fee * 0.3
}

const getFees = (chainId: CHAIN_ID) => {
  return async (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    const dateTime = `${date.getUTCFullYear()}-${formatDate(date.getUTCMonth()+1)}-${formatDate(date.getUTCDate())}`
    const parameter = `[{"type":"date/single","value":"${dateTime}","target":["variable",["template-tag","timestamp"]],"id":"eff4a885"}]`
    const feePathUrl = `${feesDataEndpoint}?parameters=${encodeURIComponent(parameter)}&dashboard_id=2`
    const porPathUrl = `${porDataEndpoint}?parameters=${encodeURIComponent(parameter)}&dashboard_id=2`
    const feeData = (await fetchURL(feePathUrl))?.data
    const por = (await fetchURL(porPathUrl))?.data.rows[0][0]

    const result = formatMetaBaseData(feeData.cols, feeData.rows) as FeesMetaBaseData[]
    let dailyFees = 0
    let totalFees = 0

    for (const v of result) {
      if (v.chain_id === chainId) {
        dailyFees = v.fee
        totalFees = v.total_fee
        break
      }
    }

    return {
      timestamp,
      dailyFees: dailyFees.toString(),
      dailyRevenue: computeRevenue(dailyFees, por).toString(),
      dailyHoldersRevenue: computeHoldersRevenue(dailyFees, por).toString(),
      dailyProtocolRevenue: computeProtocolRevenue(dailyFees).toString(),
      totalFees: totalFees.toString(),
    };
  }
}

const adapter: Adapter = {
  adapter: {
    [ARBITRUM]: {
      fetch: getFees(CHAIN_ID.ARB),
      start: 1659312000, // 2022-08-01
    },
    [BSC]: {
      fetch: getFees(CHAIN_ID.BSC),
      start: 1659312000, // 2022-08-01
    },
    [AVAX]: {
      fetch: getFees(CHAIN_ID.AVALANCHE),
      start: 1659312000, // 2022-08-01
    },
    [FANTOM]: {
      fetch: getFees(CHAIN_ID.FTM),
      start: 1659312000, // 2022-08-01
    },
    [OPTIMISM]: {
      fetch: getFees(CHAIN_ID.OPTIMISM),
      start: 1672876800, // 2023-01-05
    },
  }
}

export default adapter;
