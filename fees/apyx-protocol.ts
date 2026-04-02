import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const APYUSD_VAULT = "0x38EEb52F0771140d10c4E9A9a72349A329Fe8a6A"
const APXUSD = "0x98A878b1Cd98131B271883B390f68D2c90674665"
const FEE_WALLET = "0x6F93635F2A1C19b4F7f1BD9BA655F6A073C629Dc"

const methodology = {
  Fees: "Total yield earned on RWA backing assets (share price appreciation) plus withdrawal fees (0.1% unlocking fee on apyUSD redemptions).",
  SupplySideRevenue: "Yield distributed to apyUSD vault depositors via share price appreciation.",
  ProtocolRevenue: "Unlocking fees (0.1%) on apyUSD withdrawals, sent to the protocol fee wallet.",
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  const [oldAssets, newAssets, oldShares, newShares] = await Promise.all([
    options.fromApi.call({ abi: "uint256:totalAssets", target: APYUSD_VAULT }),
    options.toApi.call({ abi: "uint256:totalAssets", target: APYUSD_VAULT }),
    options.fromApi.call({ abi: "uint256:totalSupply", target: APYUSD_VAULT }),
    options.toApi.call({ abi: "uint256:totalSupply", target: APYUSD_VAULT }),
  ])

  const oldPrice = Number(oldShares) > 0 ? Number(oldAssets) / Number(oldShares) : 1
  const newPrice = Number(newShares) > 0 ? Number(newAssets) / Number(newShares) : 1
  const avgShares = (Number(oldShares) + Number(newShares)) / 2
  const yieldUsd = (newPrice - oldPrice) * avgShares / 1e18

  if (yieldUsd > 0) {
    dailyFees.addUSDValue(yieldUsd)
    dailySupplySideRevenue.addUSDValue(yieldUsd)
  }

  const feeTransfers = await options.getLogs({
    target: APXUSD,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      null as any,
      "0x000000000000000000000000" + FEE_WALLET.slice(2).toLowerCase(),
    ],
  })

  for (const log of feeTransfers) {
    if (log.from.toLowerCase() === APYUSD_VAULT.toLowerCase()) {
      dailyFees.add(APXUSD, log.value)
      dailyProtocolRevenue.add(APXUSD, log.value)
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2026-02-17",
    },
  },
  methodology,
}

export default adapter
