import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { VAULT, usd30 } from '../helpers/zeustrade'

const fetch = async (options: FetchOptions) => {
  const api = options.toApi
  const vaultUtils = await api.call({ target: VAULT, abi: 'address:vaultUtils' })
  const keys = await api.fetchList({
    target: vaultUtils,
    lengthAbi: 'uint256:getPositionsAmount',
    itemAbi: 'function getPositionKeyByIndex(uint256) view returns (bytes32)',
  })

  const positionSizes = await api.multiCall({
    target: VAULT,
    abi: 'function positions(bytes32) view returns (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 reserveAmount, int256 realisedPnl, uint256 lastIncreasedTime)',
    calls: keys,
  })
  const positions = await api.multiCall({
    target: vaultUtils,
    abi: 'function userPositions(bytes32) view returns (address account, address collateralToken, address indexToken, bool isLong)',
    calls: keys,
  })

  let longSize = 0n
  let shortSize = 0n
  positionSizes.forEach(([value], index) => {
    // A full liquidation may leave a key in VaultUtils with zero size in Vault.
    const size = BigInt(value)
    if (positions[index][3]) longSize += size
    else shortSize += size
  })

  // Vault position size is already denominated in USD. Each position faces the
  // shared ZLP pool, so each user position contributes to exactly one side.
  const openInterestAtEnd = options.createBalances()
  const longOpenInterestAtEnd = options.createBalances()
  const shortOpenInterestAtEnd = options.createBalances()
  openInterestAtEnd.addUSDValue(usd30(longSize + shortSize))
  longOpenInterestAtEnd.addUSDValue(usd30(longSize))
  shortOpenInterestAtEnd.addUSDValue(usd30(shortSize))
  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // OI is a snapshot at the window end.
  fetch,
  chains: [CHAIN.BASE],
  start: '2026-05-05',
  methodology: {
    OpenInterest: 'Sum of each open position’s native USD size at the end of the window, from historical Vault state. ZEUS records size as USD entry notional. Positions face a single ZLP pool, so total OI is long plus short and each position is counted once.',
  },
}

export default adapter
