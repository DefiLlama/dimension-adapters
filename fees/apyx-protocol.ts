import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"

/**
 *
 * Apyx Protocol issues apyUSD, an ERC-4626 yield-bearing stablecoin backed by RWA assets.
 *
 * The price of apyUSD increases from accrued yields on backing assets,
 * measured by vault share price appreciation (totalAssets / totalSupply).
 *
 * All yield is passed through to depositors; there is currently no protocol take rate.
 *
 */

const APYUSD_VAULT = "0x38EEb52F0771140d10c4E9A9a72349A329Fe8a6A"

const methodology = {
  Fees: "Total yield earned on RWA backing assets, measured by apyUSD vault share price appreciation.",
  Revenue: "No protocol revenue currently; all yield is distributed to apyUSD holders.",
  SupplySideRevenue: "Yield distributed to apyUSD vault depositors via share price appreciation.",
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

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
    dailyFees.addUSDValue(yieldUsd, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.addUSDValue(yieldUsd, METRIC.ASSETS_YIELDS)
  }

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
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
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield earned on RWA backing assets, measured by apyUSD vault share price appreciation (totalAssets / totalSupply).",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "All yield is distributed to apyUSD vault depositors via share price appreciation.",
    },
  },
}

export default adapter
