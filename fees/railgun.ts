import { Chain } from "@defillama/sdk/build/general";
import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


type IContract = {
  [key in Chain]: string
}

const contract: IContract = {
  [CHAIN.ETHEREUM]: '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9',
  [CHAIN.ARBITRUM]: '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9',
  [CHAIN.BSC]: '0x590162bf4b50f6576a459b75309ee21d92178a10',
  [CHAIN.POLYGON]: '0x19b620929f97b7b990801496c3b361ca5def8c71',
}
const topic0_shield = '0x3a5b9dc26075a3801a6ddccf95fec485bb7500a91b44cec1add984c21ee6db3b';
// token index 8
// amount index 17
const topic0_unshield = '0xd93cf895c7d5b2cd7dc7a098b678b3089f37d91f48d9b83a0800a91cbdf05284';
// token index 2
// amount index 5
const eventAbis = {
  "Shield": "event Shield(uint256 treeNumber, uint256 startPosition, (bytes32 npk, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint120 value)[] commitments, (bytes32[3] encryptedBundle, bytes32 shieldKey)[] shieldCiphertext, uint256[] fees)",
  "Unshield": "event Unshield(address to, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint256 amount, uint256 fee)",
}

const fetchFees = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances()
    const logs_shield = await getLogs({ target: contract[chain], topics: [topic0_shield], eventAbi: eventAbis.Shield })
    const logs_unshield = await getLogs({ target: contract[chain], topics: [topic0_unshield], eventAbi: eventAbis.Unshield })
    
    logs_shield.forEach((log) => {
      dailyFees.addTokens(log.commitments.map((i: any) => i.token.tokenAddress), log.fees)
    })
    logs_unshield.forEach((log) => {
      dailyFees.add(log.token.tokenAddress, log.fee)
    })

    return {
      dailyFees: dailyFees,
      dailyRevenue: dailyFees,
      dailyBribesRevenue: dailyFees,
      timestamp,
    }
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: 1651363200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM),
      start: 1674864000,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON),
      start: 1682899200,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees(CHAIN.BSC),
      start: 1682899200,
    },
  }
}

export default adapters;
