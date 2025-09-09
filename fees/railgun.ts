// Holders Buybacks started from the 01 Feb, 2023 15:13:11 UTC
// https://docs.railgun.org/wiki/rail-token/rail-active-governor-rewards

import { Chain } from "../adapters/types";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from '../helpers/coreAssets.json'


const contract: Record<Chain, string> = {
  [CHAIN.ETHEREUM]: '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9',
  [CHAIN.ARBITRUM]: '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9',
  [CHAIN.BSC]: '0x590162bf4b50f6576a459b75309ee21d92178a10',
  [CHAIN.POLYGON]: '0x19b620929f97b7b990801496c3b361ca5def8c71',
}

const topic0_shield = '0x3a5b9dc26075a3801a6ddccf95fec485bb7500a91b44cec1add984c21ee6db3b';
const topic0_unshield = '0xd93cf895c7d5b2cd7dc7a098b678b3089f37d91f48d9b83a0800a91cbdf05284';

const eventAbis = {
  "Shield": "event Shield(uint256 treeNumber, uint256 startPosition, (bytes32 npk, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint120 value)[] commitments, (bytes32[3] encryptedBundle, bytes32 shieldKey)[] shieldCiphertext, uint256[] fees)",
  "Unshield": "event Unshield(address to, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint256 amount, uint256 fee)",
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const logs_shield = await options.getLogs({ target: contract[options.chain], topics: [topic0_shield], eventAbi: eventAbis.Shield })
  const logs_unshield = await options.getLogs({ target: contract[options.chain], topics: [topic0_unshield], eventAbi: eventAbis.Unshield })

  logs_shield.forEach((log) => {
    dailyFees.addTokens(log.commitments.map((i: any) => i.token.tokenAddress), log.fees)
  })
  logs_unshield.forEach((log) => {
    dailyFees.add(log.token.tokenAddress, log.fee)
  })

  let dailyHoldersRevenue = options.createBalances();
  if (options.chain === CHAIN.ETHEREUM) {
    dailyHoldersRevenue = await addTokensReceived({
      options,
      tokens: [ADDRESSES.ethereum.WETH, ADDRESSES.ethereum.DAI],
      targets: ['0xA02782CE1bF85f56f8cC7C0E66e61299Ac75c86f'],
    });
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue
  }
}

const info = {
  methodology: {
    Fees: 'All fees paid by users using Railgun privacy services.',
    Revenue: 'All fees collected by Railgun.',
    HoldersRevenue: '2% of the treasury is distributed to the claiming mechanism every 2 weeks. This means that every year, ~52% of the treasury goes to stakers',
  }
}

const adapters: SimpleAdapter = {
  fetch,
  methodology: info.methodology,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2022-05-01', },
    [CHAIN.ARBITRUM]: { start: '2022-05-01', },
    [CHAIN.POLYGON]: { start: '2022-05-01', },
    [CHAIN.BSC]: { start: '2022-05-01', },
  },
}

export default adapters;
