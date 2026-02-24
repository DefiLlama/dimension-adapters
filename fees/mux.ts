import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const CHAIN_ID_CONFIG: Record<string, number> = {
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.BSC]: 56,
  [CHAIN.FANTOM]: 250,
  [CHAIN.AVAX]: 43114,
  [CHAIN.OPTIMISM]: 10,
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
  return date < 10 ? `0${date}` : `${date }`
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

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const chainId = CHAIN_ID_CONFIG[options.chain]
  const date = new Date(timestamp * 1000)
  const dateTime = `${date.getUTCFullYear()}-${formatDate(date.getUTCMonth()+1)}-${formatDate(date.getUTCDate())}`
  const parameter = `[{"type":"date/single","value":"${dateTime}","target":["variable",["template-tag","timestamp"]],"id":"eff4a885"}]`
  const feePathUrl = `${feesDataEndpoint}?parameters=${encodeURIComponent(parameter)}&dashboard_id=2`
  const porPathUrl = `${porDataEndpoint}?parameters=${encodeURIComponent(parameter)}&dashboard_id=2`
  const feeData = (await fetchURL(feePathUrl))?.data
  const por = (await fetchURL(porPathUrl))?.data.rows[0][0]

  const result = formatMetaBaseData(feeData.cols, feeData.rows) as FeesMetaBaseData[]
  let dailyFees = 0

  for (const v of result) {
    if (v.chain_id === chainId) {
      dailyFees = v.fee
      break
    }
  }

  return {
    dailyFees,
    dailyRevenue: computeRevenue(dailyFees, por),
    dailyHoldersRevenue: computeHoldersRevenue(dailyFees, por),
    dailyProtocolRevenue: computeProtocolRevenue(dailyFees),
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2022-08-01', // 2022-08-01
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2022-08-01', // 2022-08-01
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2022-08-01', // 2022-08-01
    },
    [CHAIN.FANTOM]: {
      fetch,
      start: '2022-08-01', // 2022-08-01
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2023-01-05', // 2023-01-05
    },
  }
}

export default adapter;
