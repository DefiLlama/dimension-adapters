
import { FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

const pools = {
  '0xe3f59ab3c37c33b6368cdf4f8ac79644011e402c': {
    tokens: ['0x931715FEE2d06333043d11F658C8CE934aC61D0c', '0xCa01a1D0993565291051daFF390892518ACfAD3A', '0xFFFFFFfFea09FB06d082fd1275CD48b191cbCD1d'],
  },
  '0x09a793cca9d98b14350f2a767eb5736aa6b6f921': {
    tokens: ['0x8f552a71EFE5eeFc207Bf75485b356A0b3f01eC9', '0x8e70cD5B4Ff3f62659049e74b6649c6603A0E594', '0xc234A67a4F840E61adE794be47de455361b52413'],
  },
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()

  for (const [poolAddress, poolConfig] of Object.entries(pools)) {
    const events = await options.getLogs({
      eventAbi: 'event TokenSwap(address indexed buyer, uint256 tokensSold, uint256 tokensBought, uint128 soldId, uint128 boughtId)',
      target: poolAddress,
    });
    for (const event of events) {
      dailyVolume.add(poolConfig.tokens[Number(event.soldId)], event.tokensSold)
    }
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MOONBEAM],
  fetch,
  methodology: {
    UserFees: "User pays a 0.04% fee on each swap.",
    Fees: "A 0.04% of each swap is collected as trading fees",
    Revenue: "Protocol receives 0.02% of the swap fee",
    ProtocolRevenue: "Protocol receives 0.02% of the swap fee",
    SupplySideRevenue: "0.02% of the swap fee is distributed to LPs",
    HoldersRevenue: "Stakers received $GLINT in staking rewards.",
  },
}

export default adapter;
