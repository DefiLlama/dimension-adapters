import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";

const swapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to, bool isDiscountEligible)'

const FACTORY = '0x98Bb580A77eE329796a79aBd05c6D2F2b3D5E1bD'

// Fee reading: each pair has regularFee (e.g. 30 = 0.3%) read dynamically from chain
// Protocol revenue: 1/6 of fees (standard UniV2 feeTo mechanism)
const getFeeAbi = 'function getFees() view returns (uint regularFee, uint discountFee)'

const config = {
  factory: FACTORY,
  swapEvent,
  fees: 0.003, // fallback, overridden by customLogic
  customLogic: async ({ pairObject, dailyVolume, filteredPairs, fetchOptions }: any) => {
    const { createBalances, getLogs, chain, api } = fetchOptions

    const pairIds = Object.keys(filteredPairs)
    const pairFees = await api.multiCall({ abi: getFeeAbi, calls: pairIds, permitFailure: true })

    // Build per-pair regularFee map (on-chain value is in basis points / 10000)
    const feeMap: Record<string, number> = {}
    pairIds.forEach((pair: string, i: number) => {
      const result = pairFees[i]
      feeMap[pair.toLowerCase()] = result ? Number(result.regularFee) / 10000 : 0.003
    })

    // Recompute dailyFees from scratch using per-pair on-chain fees
    const correctedFees = createBalances()
    const allLogs = await getLogs({ targets: pairIds, eventAbi: swapEvent, flatten: false })
    allLogs.forEach((logs: any, index: number) => {
      if (!logs.length) return
      const pair = pairIds[index]
      const [token0, token1] = pairObject[pair]
      const pairFee = feeMap[pair.toLowerCase()]
      logs.forEach((log: any) => {
        addOneToken({ chain, balances: correctedFees, token0, token1, amount0: Number(log.amount0In) * pairFee, amount1: Number(log.amount1In) * pairFee })
        addOneToken({ chain, balances: correctedFees, token0, token1, amount0: Number(log.amount0Out) * pairFee, amount1: Number(log.amount1Out) * pairFee })
      })
    })

    return {
      dailyVolume,
      dailyFees: correctedFees,
      dailyUserFees: correctedFees,
      dailyRevenue: correctedFees.clone(1 / 6),
      dailyProtocolRevenue: correctedFees.clone(1 / 6),
      dailySupplySideRevenue: correctedFees.clone(5 / 6),
    }
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Swap fees vary per pool (read dynamically from each pair contract).",
    UserFees: "Users pay the full swap fee per trade.",
    SupplySideRevenue: "LPs receive 5/6 of swap fees.",
    ProtocolRevenue: "Protocol receives 1/6 of swap fees.",
  },
  adapter: {
    [CHAIN.KASPLEX]: {
      fetch: getUniV2LogAdapter(config),
    },
    [CHAIN.IGRA]: {
      fetch: getUniV2LogAdapter(config),
    },
  },
};

export default adapter;
