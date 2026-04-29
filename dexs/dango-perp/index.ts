import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://docs.dango.exchange/perps/8-api.html
// https://paragraph.com/@dango/dango-perps-are-live
const GRAPHQL_ENDPOINT = "https://api-mainnet.dango.zone/graphql";
const PERPS_CONTRACT = "0x90bc84df68d1aa59a857e04ed529e9a26edbea4f";

const paramsQuery = `query {
  queryApp(request: {
    wasm_smart: {
      contract: "${PERPS_CONTRACT}"
      msg: { param: {} }
    }
  })
}`;

function pairStateQuery(pairId: string) {
	return `query {
    queryApp(request: {
      wasm_smart: {
        contract: "${PERPS_CONTRACT}"
        msg: { pair_state: { pair_id: "${pairId}" } }
      }
    })
  }`;
}

const pairStatsQuery = `query {
  allPerpsPairStats {
    pairId
    currentPrice
  }
}`;

function candleQuery(pairId: string, laterThan: string, earlierThan: string) {
	return `query {
    perpsCandles(pairId: "${pairId}", interval: ONE_DAY, laterThan: "${laterThan}", earlierThan: "${earlierThan}", first: 1) {
      nodes { volumeUsd timeStart timeEnd }
    }
  }`;
}

interface PairState {
	long_oi: string;
	short_oi: string;
}

const fetch = async (options: FetchOptions) => {
	const { startOfDay } = options;

	const laterThan = new Date((startOfDay - 86400) * 1000).toISOString();
	const earlierThan = new Date(startOfDay * 1000).toISOString();

	// Fetch dynamic pair list with prices, and fee params from contract
	const [statsRes, paramsRes]: any[] = await Promise.all([
		request(GRAPHQL_ENDPOINT, pairStatsQuery),
		request(GRAPHQL_ENDPOINT, paramsQuery),
	]);

	const pairStats: { pairId: string; currentPrice: string }[] = statsRes.allPerpsPairStats;

	// Fetch candles and OI for all pairs in parallel
	const [candleResults, stateResults] = await Promise.all([
		Promise.all(
			pairStats.map((p) =>
				request(GRAPHQL_ENDPOINT, candleQuery(p.pairId, laterThan, earlierThan))
			)
		),
		Promise.all(
			pairStats.map((p) =>
				request(GRAPHQL_ENDPOINT, pairStateQuery(p.pairId))
			)
		),
	]);

	let dailyVolume = 0;
	for (const res of candleResults) {
		for (const node of res.perpsCandles.nodes) {
			dailyVolume += Number(node.volumeUsd);
		}
	}

	let longOI = 0;
	let shortOI = 0;
	for (let i = 0; i < pairStats.length; i++) {
		const state: PairState = stateResults[i].queryApp.wasm_smart;
		const price = Number(pairStats[i].currentPrice);
		longOI += Number(state.long_oi) * price;
		shortOI += Number(state.short_oi) * price;
	}

	// Fee params from contract
	const params = paramsRes.queryApp.wasm_smart;
	const takerFeeRate = Number(params.taker_fee_rates.base);
	const protocolFeeRate = Number(params.protocol_fee_rate);

	const dailyFees = dailyVolume * takerFeeRate;
	const dailyRevenue = dailyFees * protocolFeeRate;

	return {
		dailyVolume,
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue: dailyRevenue,
		dailySupplySideRevenue: dailyFees - dailyRevenue,
		longOpenInterestAtEnd: longOI,
		shortOpenInterestAtEnd: shortOI,
		openInterestAtEnd: longOI + shortOI,
	};
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.DANGO]: {
			fetch,
			runAtCurrTime: false,
			start: "2026-04-08",
		},
	},
	methodology: {
		Volume:
			"Sum of notional volume across all perpetual trading pairs from daily candle data.",
		Fees: "Trading fees estimated from daily volume multiplied by the base taker fee rate",
		Revenue:
			"Protocol revenue is 50% of trading fees (protocol_fee_rate).",
		SupplySideRevenue:
			"Fees distributed to the vault LPs (50% of total fees).",
	},
};

export default adapter;
