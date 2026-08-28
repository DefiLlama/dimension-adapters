import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

// Surge liquidations run as Dutch auctions: VaultManager opens an auction over an
// unhealthy loan's BTC collateral, and AuctionHouse.buy() is the single point at
// which that collateral leaves the borrower.
const VAULT_MANAGER = '0x0D5D12de1cC71060A38F25DD9d24DA1DD6eB705a'

// AuctionHouse is swappable — VaultManager has been repointed at a fresh proxy
// before — so the houses that have served Base are listed here and the live one is
// read on-chain, keeping history intact across a future swap.
const AUCTION_HOUSES = ['0xE5Ff1E177dDE3FC33f5457855b14e6bD3B0C6566']

// buy() emits LogAuctionBought and LogAuctionFinalized over the same collateral in
// a single call, so only one of the two may be counted. LogAuctionCreated is not
// usable either: an auction can expire or be cancelled without a sale.
const AuctionBought =
  'event LogAuctionBought(uint256 indexed nftId, address indexed winner, bytes btcAddress, uint256 originalDebt, uint256 actualPaid, uint256 collateralSats)'

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const live = await options.api.call({ target: VAULT_MANAGER, abi: 'address:auctionHouse' })
  const targets = Array.from(new Set([...AUCTION_HOUSES, live].map((address: string) => address.toLowerCase())))

  const logsPerHouse = await Promise.all(
    targets.map(target => options.getLogs({ target, eventAbi: AuctionBought }))
  )

  for (const log of logsPerHouse.flat()) {
    // Collateral is native BTC held in the borrower's Taproot vault; on Base it
    // exists only as a satoshi amount, so there is no ERC20 to price against.
    dailyCollateralLiquidated.addCGToken('bitcoin', Number(log.collateralSats) / 1e8)
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2026-02-02',
    },
  },
  methodology: {
    CollateralLiquidated:
      "Total USD value of native BTC collateral seized from borrowers when a Surge liquidation auction is bought, read from the `collateralSats` field of AuctionHouse `LogAuctionBought` events on Base and priced as bitcoin.",
  },
}

export default adapter
