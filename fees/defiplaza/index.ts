import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type RadixPlazaResponse = {
	date: number,
	stateVersion: number,
	totalValueLockedUSD: number,
	volumeUSD: number,
	feesUSD: number,
	royaltiesUSD: number,
	swaps: number
}

const thegraph_endpoints = `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/4z9FBF12CrfoQJhAkWicqzY2fKYN9QRmuzSsizVXhjKa`;
const radix_endpoint = "https://radix.defiplaza.net/api/defillama/volume";

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.ETHEREUM]: {
			fetch: async ({ startTimestamp, endTimestamp }: FetchOptions) => {
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
						}
					}`));
				const dailySupplySideRevenue = graphData.dailies[0].feesUSD;
				const dailyFees = dailySupplySideRevenue;
				const dailyUserFees = dailyFees;

				return {
					totalVolume: graphData.factories[0].totalTradeVolumeUSD,
					dailyVolume: graphData.dailies[0].tradeVolumeUSD,

					totalFees: graphData.factories[0].totalFeesEarnedUSD,
					dailyUserFees,
					dailyFees,
					dailySupplySideRevenue,
				}
			},
			meta: {
				methodology: {
					Fees: "User pays a small percentage of each swap, which is updated manually on an irregular basis to optimize aggregator volume.",
					SupplySideRevenue: "LPs revenue is a small percentage of each swap, which is updated manually on an irregular basis to optimize aggregator volume.",
				}
			},
			start: 1633237008
		},
		[CHAIN.RADIXDLT]: {
			fetch: async ({ endTimestamp }: FetchOptions) => {
				const daily: RadixPlazaResponse = (await fetchURL(radix_endpoint + `?timestamp=${endTimestamp}`));

				const dailySupplySideRevenue = daily.feesUSD;
				const dailyProtocolRevenue = daily.royaltiesUSD;
				const dailyRevenue = dailyProtocolRevenue;
				const dailyFees = dailySupplySideRevenue + dailyRevenue;
				const dailyUserFees = dailyFees;

				return {
					dailyVolume: daily.volumeUSD,
					dailyUserFees,
					dailyFees,
					dailyRevenue,
					dailyProtocolRevenue,
					dailySupplySideRevenue,
				}
			},
			meta: {
				methodology: {
					Fees: "User pays 0.5% of each swap, double if hopping between pairs is needed.",
					Revenue: "Protocol takes 5ct USD per swap, double if hopping between pairs is needed.",
					SupplySideRevenue: "LPs revenue is 0.5% of each swap, double if hopping between pairs is needed.",
				}
			},
			start: 1700784000
		}
	},
};

export default adapter;
