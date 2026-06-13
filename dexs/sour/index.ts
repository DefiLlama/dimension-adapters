import { FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { PromisePool } from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";
import { METRIC } from "../../helpers/metrics";

const SOUR_API_URL = 'https://app.sour.finance/api';

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
    const marketsReponse = await fetchURL(`${SOUR_API_URL}/markets/index`)
    const marketIdsToFees: Map<string, number> = new Map(marketsReponse.markets.map((market: any) => [market.id, market.feeMicros / 1e6]))

    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()

    await PromisePool.withConcurrency(1).for(marketIdsToFees.keys()).process(async (marketId: any) => {
        const volumeResponse = await fetchURLAutoHandleRateLimit(`${SOUR_API_URL}/markets/${marketId}/volume?from=${options.startTimestamp}&to=${options.endTimestamp}`)
        const volume = Number(volumeResponse.volumeMicros) / 1e6
        const fees = volume * (marketIdsToFees.get(marketId) ?? 0.0003)

        dailyVolume.addUSDValue(volume)
        dailyFees.addUSDValue(fees, METRIC.TRADING_FEES)
        dailySupplySideRevenue.addUSDValue(fees, "Trading fees to SOUR LP vault")

        await sleep(1000)
    })

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "3 basis points (0.0003) × daily volume. Flat per-fill rate, no taker/maker split, no tier ladder.",
    UserFees: "3 basis points (0.0003) × daily volume. Flat per-fill rate, no taker/maker split, no tier ladder.",
    Revenue: "0. The Sour protocol does not claim any portion of the fee — 100% routes to the SOUR LP vault.",
    SupplySideRevenue: "100% of fees. The LP vault is the economic owner of the protocol; LPs receive all fee flow.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "3 basis points (0.0003) × daily volume. Flat per-fill rate, no taker/maker split, no tier ladder.",
    },
    SupplySideRevenue: {
        "Trading fees to SOUR LP vault": " 3 basis points (0.0003) × daily volume. Flat per-fill rate, no taker/maker split, no tier ladder.",
    },
};

const adapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2026-05-06',
    methodology,
    breakdownMethodology,
};

export default adapter;