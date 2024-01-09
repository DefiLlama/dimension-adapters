import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";

interface ILog {
	data: string;
	transactionHash: string;
}
interface IAmount {
	amount0: number;
	amount1: number;
}

const topic0 = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';
const FACTORY_ADDRESS = '0x01f43d2a7f4554468f77e06757e707150e39130c';

type TABI = {
	[k: string]: object;
}
const ABIs: TABI = {
	allPairsLength: {
		"type": "function",
		"stateMutability": "view",
		"outputs": [
			{
				"type": "uint256",
				"name": "",
				"internalType": "uint256"
			}
		],
		"name": "allPairsLength",
		"inputs": []
	},
	allPairs: {
		"type": "function",
		"stateMutability": "view",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"inputs": [
			{
				"type": "uint256",
				"name": "",
				"internalType": "uint256"
			}
		],
		"name": "allPairs",
	}
};

const PAIR_TOKEN_ABI = (token: string): object => {
	return {
		"constant": true,
		"inputs": [],
		"name": token,
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	}
};

const graph = (_chain: Chain) => {
	return async (timestamp: number) => {
		const fromTimestamp = timestamp - 60 * 60 * 24
		const toTimestamp = timestamp;

		try {
			const poolLength = (await sdk.api2.abi.call({
				target: FACTORY_ADDRESS,
				chain: _chain,
				abi: ABIs.allPairsLength,
			}));

			const poolsRes = await sdk.api2.abi.multiCall({
				abi: ABIs.allPairs,
				calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
					target: FACTORY_ADDRESS,
					params: i,
				})),
				chain: _chain
			});

			const lpTokens = poolsRes

			const [underlyingToken0, underlyingToken1] = await Promise.all(
				['token0', 'token1'].map((method) =>
					sdk.api2.abi.multiCall({
						abi: PAIR_TOKEN_ABI(method),
						calls: lpTokens.map((address: string) => ({
							target: address,
						})),
						chain: _chain
					})
				)
			);

			const tokens0 = underlyingToken0;
			const tokens1 = underlyingToken1;
			const fromBlock = (await getBlock(fromTimestamp, _chain, {}));
			const toBlock = (await getBlock(toTimestamp, _chain, {}));
			const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
				target: address,
				toBlock: toBlock,
				fromBlock: fromBlock,
				chain: _chain,
				topics: [topic0]
			})))) as any;

			const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${_chain}:${e}`);
			const coins = [...new Set(rawCoins)]
			const prices = await getPrices(coins, timestamp);
			const fees: number[] = lpTokens.map((_: string, index: number) => {
				const token0Decimals = (prices[`${_chain}:${tokens0[index]}`]?.decimals || 0)
				const token1Decimals = (prices[`${_chain}:${tokens1[index]}`]?.decimals || 0)
				const log: IAmount[] = logs[index]
					.map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
					.map((p: ILog) => {
						const amount0 = Number('0x' + p.data.slice(0, 64)) / 10 ** token0Decimals;
						const amount1 = Number('0x' + p.data.slice(64, 128)) / 10 ** token1Decimals
						return {
							amount0,
							amount1
						} as IAmount
					}) as IAmount[];
				const token0Price = (prices[`${_chain}:${tokens0[index]}`]?.price || 0);
				const token1Price = (prices[`${_chain}:${tokens1[index]}`]?.price || 0);

				const feesAmount0 = log
					.reduce((a: number, b: IAmount) => Number(b.amount0) + a, 0)	* token0Price;
				const feesAmount1 = log
					.reduce((a: number, b: IAmount) => Number(b.amount1) + a, 0)	* token1Price;

				const feesUSD = feesAmount0 + feesAmount1;
				return feesUSD;
			});

			const dailyFees = fees.reduce((a: number, b: number) => a+b,0)
			return {	// LPs get 0% fees, 100% goes to Guru's Treasury, which buys back ELITE
				dailyFees: `${dailyFees}`,
				dailyRevenue:	`${dailyFees}`,
				dailyHoldersRevenue: `${dailyFees}`,
				timestamp,
			};
		} catch(error) {
			console.error(error);
			throw error;
		}
	}
}

const methodology = {
  UserFees: "Users pay a Trading fee on each swap, including Flash Loans.",
  Fees: "Net Trading fees paid by all ABcDeFx users.",
  Revenue: "100% of the trading fee is collected by Protocol.",
  ProtocolRevenue: "100% of the trading fee is collected by Protocol Treasury.",
  HoldersRevenue: "100% of Trade Fees is used to buyback ELITE.",
  SupplySideRevenue: "0% of trading fees are distributed among liquidity providers."
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.KCC]:		{ fetch: graph(CHAIN.KCC),		start: async () => 1670188701,	meta: { methodology }	},
		//[CHAIN.MULTIVAC]:	{ fetch: graph(CHAIN.MULTIVAC),	start: async () => 1670226950,	meta: { methodology }	},	/// ! typeof CHAIN
		[CHAIN.FANTOM]: 	{ fetch: graph(CHAIN.FANTOM),	start: async () => 1671580916,	meta: { methodology }	},
		//[CHAIN.ECHELON]:	{ fetch: graph(CHAIN.ECHELON),	start: async () => 1671608400,	meta: { methodology }	},	/// ded!?
		[CHAIN.KAVA]:		{ fetch: graph(CHAIN.KAVA),		start: async () => 1676855943,	meta: { methodology }	}
	}
};

export default adapter;