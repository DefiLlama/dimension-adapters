import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const STONE_VAULT = "0xa62f9c5af106feee069f38de51098d9d81b90572"
const STONE_TOKEN = "0x7122985656e38bdc0302db86685bb972b145bd3c"
const abi = {
    roundPricePerShare: "function roundPricePerShare(uint256) external view returns (uint256)",
    settlementTime:"function settlementTime(uint256) external view returns (uint256)",
}

const fetch = async ({createBalances, api,}: FetchOptions) => {
    const roundID = await api.call({
        target: STONE_VAULT,
        abi: "function latestRoundID() external view returns (uint256)",
    })

    const [priceStart, priceEnd, timeStart, timeEnd, totalSupply] = await Promise.all([
        api.call({
            target: STONE_VAULT,
            abi: abi.roundPricePerShare,
            params: [roundID - 2]
        }),
        api.call({
            target: STONE_VAULT,
            abi: abi.roundPricePerShare,
            params: [roundID - 1] 
        }),
        api.call({
            target: STONE_VAULT,
            abi: abi.settlementTime,
            params: [roundID - 2] 
        }),
        api.call({
            target: STONE_VAULT,
            abi: abi.settlementTime,
            params: [roundID - 1] 
        }),
        api.call({
            target: STONE_TOKEN,
            abi: "function totalSupply() external view returns (uint256)",
        })
    ])
    

    const priceIncrease = priceEnd - priceStart
    const ethRewards = (priceIncrease * totalSupply) / 1e18
    const timeDiff = timeEnd - timeStart
    const dailyEthRewards = (ethRewards * 86400) / timeDiff

    const dailyFees = createBalances()
    dailyFees.addGasToken(dailyEthRewards)

    return {
        dailyFees
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
      [CHAIN.ETHEREUM]: {
          fetch: fetch,
          meta: {
              methodology: {
                  dailyFees: "Staking rewards earned by all staked ETH"
              }
          }
      }
    }
  };
  
  export default adapter;