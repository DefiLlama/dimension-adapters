import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";
import { ChainApi } from "@defillama/sdk";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { getBlock } from "../../helpers/getBlock";

const FACTORY_ADDRESS = "0xa5136eAd459F0E61C99Cec70fe8F5C24cF3ecA26";
const INFT_ADDRESS = "0xa155f12D3Be29BF20b615e1e7F066aE9E3C5239a";
const LINEA_WETH_ADDRESS = ADDRESSES.linea.WETH;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const FEE_VOLUME_MULTIPLIER = 1000 / 2;

const fetchTotalFees = async (api: ChainApi): Promise<number> => {
  const pools = await api.fetchList({ lengthAbi: 'allPoolsLength', itemAbi: 'allPools', target: FACTORY_ADDRESS })
  const tokens = await api.multiCall({ abi: 'address:poolToken', calls: pools })
  tokens.push(LINEA_WETH_ADDRESS);
  await api.sumTokens({ owner: INFT_ADDRESS, tokens })
  let harvestedBalance = await api.multiCall({
    target: INFT_ADDRESS,
    abi: "function harvestedBalance(address) external view returns (uint256)",
    calls: tokens,
  })
  api.addTokens(tokens, harvestedBalance)
  return (await api.getUSDValue()) * 2;
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.LINEA]: {
      fetch: async (timestamp, chainBlocks) => {
        const currentBlock = await getBlock(timestamp, "linea", chainBlocks);
        const lastDayBlock = await getBlock(timestamp - ONE_DAY_IN_SECONDS, "linea", {});
        const currentApi = new ChainApi({ chain: 'linea', block: currentBlock });
        const lastDayApi = new ChainApi({ chain: 'linea', block: lastDayBlock });

        const cumulativeFees = await fetchTotalFees(currentApi);
        const lastDayCumulativeFees = await fetchTotalFees(lastDayApi)

        const dailyFees = cumulativeFees - lastDayCumulativeFees

        return {
          dailyFees: Number(dailyFees).toFixed(0),
          dailyVolume: Number(FEE_VOLUME_MULTIPLIER * dailyFees).toFixed(0),
        } as unknown as FetchResult;
      },
      start: '2023-08-18', // Aug-18-2023 08:39:25 AM +UTC
    },
  },
  methodology: {
    totalFees:
      "Total fees are calculated by checking the token balances of the Xfai INFT",
  },
};

export default adapter;
