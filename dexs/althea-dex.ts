import { FetchOptions, FetchV2, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const DEX_ADDRESS = "0xd263DC98dEc57828e26F69bA8687281BA5D052E0";
const QUERY_HELPER_ADDRESS = "0xf7b59E4f71E467C0e409609A4a0688b073C56142";

const abi = {
  swap: 'event Swap(address indexed user, address indexed base, address indexed quote, uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint128 minOutput, int128 baseFlow, int128 quoteFlow)',
  queryPoolTemplate: 'function queryPoolTemplate (uint256 poolIdx) public view returns (uint8 schema_, uint16 feeRate_, uint8 protocolTake_, uint16 tickSize_, uint8 jitThresh_, uint8 knockoutBits_, uint8 oracleFlags_)',
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const logs: any[] = await options.getLogs({ target: DEX_ADDRESS, eventAbi: abi.swap, });

  const uniquePoolIdxs = new Set<number>();
  logs.forEach((log: any) => uniquePoolIdxs.add(Number(log.poolIdx)))
  const uniquePools = Array.from(uniquePoolIdxs)

  const uniqpuePoolInfoMap: { [key: number]: any } = {};
  const feeRatesByIndex: { [key: number]: number } = {};

  const poolInfos = await options.api.multiCall({ abi: abi.queryPoolTemplate, calls: uniquePools, target: QUERY_HELPER_ADDRESS })
  poolInfos.forEach((info: any, idx: number) => {
    uniqpuePoolInfoMap[uniquePools[idx]] = info
    // The fee rate is in hundredths of a basis point, so to convert to the fee rate as a decimal divide by 10,000,000
    feeRatesByIndex[uniquePools[idx]] = Number(info.feeRate_)/ 1e8; // Pre-fetch fee rates
  })

  logs.forEach((log: any) => {
    const token0 = log.base
    const token1 = log.quote
    const amount0 = +log.baseFlow.toString()
    const amount1 = +log.quoteFlow.toString()
    const fee = feeRatesByIndex[Number(log.poolIdx)]

    if (fee === undefined)
      throw new Error(`Fee rate not found for poolIdx ${log.poolIdx}`)

    addOneToken({ balances: dailyVolume, token0, amount0, token1, amount1 })
    addOneToken({ balances: dailyFees, token0, amount0: token0 * fee, token1, amount1: amount1 * fee })
  })

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees, dailyProtocolRevenue: 0 }
}

const methodology = {
  Volume: "iFi (Infrastructure Finance) DEX trade volume",
  Fees: "Trading fees are paid by users",
  UserFees: "All fees on iFi DEX are paid by users",
  Revenue: "iFi DEX doesnt take any fee share",
  ProtocolRevenue: "iFi DEX doesnt take any fee share",
  SupplySideRevenue: "All the trading fees go to liquidity providers",
}

export default {
  version: 2,
  fetch,
  chains: [CHAIN.ALTHEA_L1],
  start: '2025-10-07',
  methodology
}