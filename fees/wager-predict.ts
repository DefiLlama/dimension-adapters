import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

// Add a chain by listing its FeeRouter and USDW. Daily fees and revenue are the
// increase in FeeRouter.totalPlatformFees() over the window.
const deployments: Record<string, { feeRouter: string; token: string; start: string }> = {
  [CHAIN.BSC]: {
    feeRouter: "0x186DCA432CE9f9B5618fcBb7231a6bE3FcEAe454",
    token: "0xe5eBE2AE0a036C955bfF58291826C50F7d670D43",
    start: "2026-10-05",
  },
}

const totalPlatformFeesAbi = "uint256:totalPlatformFees"

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { feeRouter, token } = deployments[options.chain]
  const [fromFees, toFees] = await Promise.all([
    options.fromApi.call({ target: feeRouter, abi: totalPlatformFeesAbi }),
    options.toApi.call({ target: feeRouter, abi: totalPlatformFeesAbi }),
  ])
  const collected = BigInt(toFees) - BigInt(fromFees)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  if (collected > 0n) {
    dailyFees.add(token, collected, "Trading Fees")
    dailyRevenue.add(token, collected, "Trading Fees To Protocol")
    dailyProtocolRevenue.add(token, collected, "Trading Fees To Protocol")
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: deployments,
  methodology: {
    Fees: "USDW trading fees accrued to the protocol, measured as the increase in FeeRouter.totalPlatformFees() on each chain where Wager Predict is deployed.",
    Revenue: "The same increase in FeeRouter.totalPlatformFees(). That counter is the platform's collected trading fees.",
    ProtocolRevenue: "The increase in FeeRouter.totalPlatformFees() kept by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      "Trading Fees": "USDW added to FeeRouter.totalPlatformFees() during the period.",
    },
    Revenue: {
      "Trading Fees To Protocol": "USDW added to FeeRouter.totalPlatformFees() during the period.",
    },
    ProtocolRevenue: {
      "Trading Fees To Protocol": "USDW added to FeeRouter.totalPlatformFees() during the period.",
    },
  },
}


export default adapter
