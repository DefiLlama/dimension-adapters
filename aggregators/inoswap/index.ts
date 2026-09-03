import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const CURRENT_V6_ROUTERS = [
  '0xd2b7004682d86f305b1418684825194d9451600c', // v6.3 current prod router
]

const LEGACY_FEE_ROUTERS = [
  '0xf514ec27666f2e9669837f4f9eca6405ba38ac64', // v5 router
  '0x025f45a3ec6e90e8e1db1492554c9b10539ef2fc', // previous v2 router
  '0x95e8f3227ecc2f35213b6fd6fece6b8854a77db5', // legacy router
]

const LEGACY_FEE_RECIPIENT = '0x53a7fcdbb5d9a8d6a9f2b83d6e70cd1efdaf76c6'
const LEGACY_PROTOCOL_FEE_BPS = 10 // 0.10%
const SWAPPED_EVENT = 'event Swapped(address indexed user,address indexed tokenIn,address indexed tokenOut,address recipient,uint256 amountIn,uint256 amountOut,uint256 fee)'

const isPositiveAmount = (value: unknown) => {
  try {
    return BigInt((value as { toString?: () => string })?.toString?.() ?? String(value ?? 0)) > 0n
  } catch {
    return false
  }
}

const isAddress = (value: unknown) => /^0x[a-fA-F0-9]{40}$/.test(String(value ?? ''))

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const legacyProtocolFees = await addTokensReceived({
    options,
    target: LEGACY_FEE_RECIPIENT,
    fromAdddesses: LEGACY_FEE_ROUTERS,
  })

  dailyFees.addBalances(legacyProtocolFees)
  dailyRevenue.addBalances(legacyProtocolFees)
  dailyVolume.addBalances(legacyProtocolFees.clone(10000 / LEGACY_PROTOCOL_FEE_BPS))

  const swapLogs = await options.getLogs({
    targets: CURRENT_V6_ROUTERS,
    eventAbi: SWAPPED_EVENT,
    flatten: true,
  })

  for (const log of swapLogs) {
    if (!isAddress(log?.tokenIn) || !isPositiveAmount(log?.amountIn)) continue
    dailyVolume.add(log.tokenIn, log.amountIn)

    if (isAddress(log?.tokenOut) && isPositiveAmount(log?.fee)) {
      dailyFees.add(log.tokenOut, log.fee)
      dailyRevenue.add(log.tokenOut, log.fee)
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: 0,
  }
}

const methodology = {
  Fees: "User fees emitted by v6 Swapped events plus legacy protocol fees sent to the fee recipient.",
  Revenue: "Protocol revenue is measured from v6 Swapped event fees and legacy fee-recipient transfers.",
  ProtocolRevenue: "Protocol revenue is measured from v6 Swapped event fees and legacy fee-recipient transfers.",
  SupplySideRevenue: "Set to 0 until explicit partner/supply-side distribution events expose token attribution.",
  UserFees: "Total user fees emitted by InoSwap routers where available.",
  Volume: "Current v6.3 volume is counted from Swapped(tokenIn, amountIn) events; legacy volume is inferred from the historical 0.10% protocol fee stream.",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CRONOS],
  start: "2026-02-01",
  methodology,
}

export default adapter;
