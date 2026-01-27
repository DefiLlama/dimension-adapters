import { ChainBlocks, FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";

const event_swap = 'event Swap(address indexed sender, address indexed to, uint24 id, bytes32 amountsIn, bytes32 amountsOut, uint24 volatilityAccumulator, bytes32 totalFees, bytes32 protocolFees)';
const FACTORY_ADDRESS = '0x8Cce20D17aB9C6F60574e678ca96711D907fD08c';

type TABI = {
	[k: string]: string;
}
const ABIs: TABI = {
	"getNumberOfLBPairs": "uint256:getNumberOfLBPairs",
	"getLBPairAtIndex": "function getLBPairAtIndex(uint256 index) view returns (address lbPair)"
}

const fetch: any = async (timestamp: number, _: ChainBlocks, { getLogs, api, createBalances }: FetchOptions) => {
	const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
	const lpTokens = await api.fetchList({ lengthAbi: ABIs.getNumberOfLBPairs, itemAbi: ABIs.getLBPairAtIndex, target: FACTORY_ADDRESS })
	const [tokens0, tokens1] = await Promise.all(['address:getTokenX', 'address:getTokenY'].map((abi: string) => api.multiCall({ abi, calls: lpTokens })));


  const pairObject: IJSON<string[]> = {}
  lpTokens.forEach((pair: string, i: number) => {
    pairObject[pair] = [tokens0[i], tokens1[i]]
  })

  // filter out the pairs with less than 1000 USD pooled value
  const filteredPairs = await filterPools({ api: api, pairs: pairObject, createBalances: createBalances })
  await Promise.all(Object.keys(filteredPairs).map(async (pair) => {
    const [token0, token1] = pairObject[pair]
    const logs = await getLogs({ target: pair, eventAbi: event_swap })
    logs.forEach(log => {
			const amountInX = Number('0x' + '0'.repeat(32) + log.amountsOut.replace('0x', '').slice(0, 32))
			const amountInY = Number('0x' + '0'.repeat(32) + log.amountsOut.replace('0x', '').slice(32, 64))
			dailyVolume.add(token1, amountInX);
			dailyVolume.add(token0, amountInY);

      const protocolFeesY = Number('0x' + log.protocolFees.replace('0x', '').slice(0, 32))
      const protocolFeesX = Number('0x' + log.protocolFees.replace('0x', '').slice(32, 64))
      const totalFeesY = Number('0x' + log.totalFees.replace('0x', '').slice(0, 32));
      const totalFeesX = Number('0x' + log.totalFees.replace('0x', '').slice(32, 64));
      dailyFees.add(token0, totalFeesX )
      dailyFees.add(token1, totalFeesY )
      dailyRevenue.add(token0, protocolFeesX)
      dailyRevenue.add(token1, protocolFeesY)
    })
  }))

	return { dailyVolume, dailyFees, dailyRevenue, timestamp };
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.IOTAEVM]: { fetch, start: '2023-04-10', },
	}
};

export default adapter;
