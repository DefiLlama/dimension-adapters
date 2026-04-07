import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const EXCHANGE = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";

// Market config: perpId → { priceDecimals, lotDecimals }
const MARKETS: Record<number, { priceDecimals: number; lotDecimals: number }> = {
    1: { priceDecimals: 1, lotDecimals: 5 },   // BTC
    10: { priceDecimals: 6, lotDecimals: 0 },   // MON
    20: { priceDecimals: 2, lotDecimals: 3 },   // ETH
};

const MakerOrderFilledEvent =
    "event MakerOrderFilled(uint256 perpId, uint256 accountId, uint256 orderId, uint256 pricePNS, uint256 lotLNS, uint256 feeCNS, uint256 lockedBalanceCNS, int256 amountCNS, uint256 balanceCNS)";

const getPerpetualInfoAbi =
    "function getPerpetualInfo(uint256 perpId) view returns ((string name, string symbol, uint256 priceDecimals, uint256 lotDecimals, bytes32 linkFeedId, uint256 priceTolPer100K, uint256 marginTol, uint256 marginTolDecimals, uint256 refPriceMaxAgeSec, uint256 positionBalanceCNS, uint256 insuranceBalanceCNS, uint256 markPNS, uint256 markTimestamp, uint256 lastPNS, uint256 lastTimestamp, uint256 oraclePNS, uint256 oracleTimestampSec, uint256 longOpenInterestLNS, uint256 shortOpenInterestLNS))";

const fetch = async (options: FetchOptions) => {
    const makerLogs = await options.getLogs({ target: EXCHANGE, eventAbi: MakerOrderFilledEvent });
    const missingPerpIds = Array.from(new Set(makerLogs.map((log: any) => Number(log.perpId)).filter((id: number) => !MARKETS[id])));

    const perpetualInfos = await options.api.multiCall({
        abi: getPerpetualInfoAbi,
        target: EXCHANGE,
        calls: missingPerpIds.map((id: number) => ({ params: [id] })),
    });

    let index = 0;
    for (const info of perpetualInfos) {
        MARKETS[missingPerpIds[index]] = {
            priceDecimals: Number(info.priceDecimals),
            lotDecimals: Number(info.lotDecimals),
        };
        index++;
    }

    let dailyVolume = 0;
    let dailyFees = 0;

    for (const log of makerLogs) {
        const perpId = Number(log.perpId);
        const market = MARKETS[perpId];
        if (!market) {
            throw new Error(`Market not found for perpId: ${perpId}`);
        }

        // Volume: price * lots in USD
        const price = Number(log.pricePNS) / 10 ** market.priceDecimals;
        const lots = Number(log.lotLNS) / 10 ** market.lotDecimals;
        dailyVolume += price * lots;

        // Fees: feeCNS in AUSD (6 decimals, 1:1 USD)
        dailyFees += Number(log.feeCNS) / 1e6;
    }

    return { dailyVolume, dailyFees };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.MONAD],
    start: "2026-02-12",
    fetch,
};

export default adapter;
