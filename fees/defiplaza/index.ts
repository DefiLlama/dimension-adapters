import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

type RadixPlazaResponse = {
	date: number,
	stateVersion: number,
	totalValueLockedUSD: number,
	volumeUSD: number,
	feesUSD: number,
	royaltiesUSD: number,
	swaps: number
}

const thegraph_endpoints = sdk.graph.modifyEndpoint('4z9FBF12CrfoQJhAkWicqzY2fKYN9QRmuzSsizVXhjKa');
const radix_endpoint = "https://radix.defiplaza.net/api/defillama/volume";

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.ETHEREUM]: {
			fetch: async ({ startTimestamp, endTimestamp, createBalances }: FetchOptions) => {
				const graphData = (await request(thegraph_endpoints, gql`
					{
						factories(first: 1) {
							swapCount
							totalTradeVolumeUSD
							totalFeesEarnedUSD
						}
						dailies(first: 1, where:{date_lte: ${endTimestamp}, date_gte: ${startTimestamp}}, orderBy: date, orderDirection:desc) {
							date
							tradeVolumeUSD
							swapUSD
							feesUSD
							swapCount
						}
					}`));

				const swap_fee_usd = Number(graphData.dailies[0].feesUSD);
				const rev_usd = Number(graphData.dailies[0].swapCount) * 0.5;

				const dailyFees = createBalances();
				const dailyRevenue = createBalances();
				const dailySupplySideRevenue = createBalances();

				dailyFees.addUSDValue(swap_fee_usd + rev_usd, METRIC.SWAP_FEES);
				dailyRevenue.addUSDValue(rev_usd, METRIC.PROTOCOL_FEES);
				dailySupplySideRevenue.addUSDValue(swap_fee_usd, METRIC.LP_FEES);

				return {
					dailyVolume: graphData.dailies[0].tradeVolumeUSD,
					dailyFees,
					dailyUserFees: dailyFees,
					dailyRevenue,
					dailyProtocolRevenue: dailyRevenue,
					dailySupplySideRevenue,
				}
			},
			start: '2021-10-03'
		},
		[CHAIN.RADIXDLT]: {
			fetch: async ({ endTimestamp, createBalances }: FetchOptions) => {
				const daily: RadixPlazaResponse = (await fetchURL(radix_endpoint + `?timestamp=${endTimestamp}`));
				const dailyFees = createBalances();
				const dailyRevenue = createBalances();
				const dailySupplySideRevenue = createBalances();

				dailyFees.addUSDValue(daily.feesUSD + daily.royaltiesUSD, METRIC.SWAP_FEES);
				dailyRevenue.addUSDValue(daily.royaltiesUSD, METRIC.PROTOCOL_FEES);
				dailySupplySideRevenue.addUSDValue(daily.feesUSD, METRIC.LP_FEES);

				return {
					dailyVolume: daily.volumeUSD,
					dailyUserFees: dailyFees,
					dailyFees,
					dailyRevenue,
					dailyProtocolRevenue: dailyRevenue,
					dailySupplySideRevenue,
				}
			},
			start: '2023-11-24'
		}
	},
	methodology: {
		Fees: "User pays 0.5% of each swap, double if hopping between pairs is needed.",
		Revenue: "Protocol takes 5ct USD per swap, double if hopping between pairs is needed.",
		ProtocolRevenue: "Protocol takes 5ct USD per swap, double if hopping between pairs is needed.",
		SupplySideRevenue: "LPs revenue is 0.5% of each swap, double if hopping between pairs is needed.",
	},
	breakdownMethodology: {
		Fees: {
			[METRIC.SWAP_FEES]: "Total swap fees paid by users, 0.5% per swap (doubled for multi-hop swaps between pairs)",
		},
		Revenue: {
			[METRIC.PROTOCOL_FEES]: "Protocol fee of $0.05 USD per swap (doubled for multi-hop swaps) on Ethereum; royalties from swaps on Radix",
		},
		ProtocolRevenue: {
			[METRIC.PROTOCOL_FEES]: "Protocol fee of $0.05 USD per swap (doubled for multi-hop swaps) on Ethereum; royalties from swaps on Radix",
		},
		SupplySideRevenue: {
			[METRIC.LP_FEES]: "Liquidity provider fees from the 0.5% swap fee after deducting the protocol's $0.05 flat fee",
		},
	}
};

export default adapter;
