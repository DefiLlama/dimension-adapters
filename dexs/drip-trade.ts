import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


async function fetch({ createBalances, getLogs }: FetchOptions) {
  const logs = await getLogs({ target: '0x7be8f48894d9EC0528Ca70d9151CF2831C377bE0', eventAbi: 'event ItemSold (address seller, address buyer, address nftAddress, uint256 tokenId, uint64 quantity, uint128 pricePerItem, address paymentToken)' })
  const dailyVolume = createBalances()
  logs.forEach((i: any) => dailyVolume.add(i.paymentToken, i.quantity * i.pricePerItem))
  return {
    dailyVolume,
    dailyFees: dailyVolume.clone(2 / 100)
  }
}

export default {
  version: 2,
  pullHourly: true,
  fetch,
  methodology: {
    Volume: 'NFT sales',
    Fees: '2% of each sale',
  },
  start: '2025-02-26',
  chains: [CHAIN.HYPERLIQUID]
}