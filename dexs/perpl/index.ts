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

const TakerOrderFilledEvent =
    "event TakerOrderFilled(uint256 entryPricePNS, uint256 perpId, uint256 accountId, uint256 lotLNS, uint256 feeCNS, uint256 lockedBalanceCNS, int256 amountCNS, uint256 balanceCNS)";

const getPerpetualInfoAbi =
    "function getPerpetualInfo(uint256 perpId) view returns ((string name, string symbol, uint256 priceDecimals, uint256 lotDecimals, bytes32 linkFeedId, uint256 priceTolPer100K, uint256 marginTol, uint256 marginTolDecimals, uint256 refPriceMaxAgeSec, uint256 positionBalanceCNS, uint256 insuranceBalanceCNS, uint256 markPNS, uint256 markTimestamp, uint256 lastPNS, uint256 lastTimestamp, uint256 oraclePNS, uint256 oracleTimestampSec, uint256 longOpenInterestLNS, uint256 shortOpenInterestLNS))";

const fetch = async (options: FetchOptions) => {
    const [makerLogs, takerLogs] = await Promise.all([
        options.getLogs({ target: EXCHANGE, eventAbi: MakerOrderFilledEvent }),
        options.getLogs({ target: EXCHANGE, eventAbi: TakerOrderFilledEvent }),
    ]);

    // Discover market config for any new perpIds
    const allPerpIds = new Set([
        ...makerLogs.map((log: any) => Number(log.perpId)),
        ...takerLogs.map((log: any) => Number(log.perpId)),
    ]);
    const missingPerpIds = Array.from(allPerpIds).filter((id: number) => !MARKETS[id]);

    if (missingPerpIds.length > 0) {
        const perpetualInfos = await options.api.multiCall({
            abi: getPerpetualInfoAbi,
            target: EXCHANGE,
            calls: missingPerpIds.map((id: number) => ({ params: [id] })),
        });

        for (let i = 0; i < perpetualInfos.length; i++) {
            MARKETS[missingPerpIds[i]] = {
                priceDecimals: Number(perpetualInfos[i].priceDecimals),
                lotDecimals: Number(perpetualInfos[i].lotDecimals),
            };
        }
    }

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    // Volume from maker fills only (one per trade, avoids double-counting)
    for (const log of makerLogs) {
        const perpId = Number(log.perpId);
        const market = MARKETS[perpId];
        if (!market) {
            throw new Error(`Perpl: unknown perpId ${perpId}`);
        }

        const price = Number(log.pricePNS) / 10 ** market.priceDecimals;
        const lots = Number(log.lotLNS) / 10 ** market.lotDecimals;
        dailyVolume.addUSDValue(price * lots);

        // Maker fees in AUSD (6 decimals, 1:1 USD)
        dailyFees.addUSDValue(Number(log.feeCNS) / 1e6, "Maker Fees");
    }

    // Taker fees (separate fee charged to taker side)
    for (const log of takerLogs) {
        dailyFees.addUSDValue(Number(log.feeCNS) / 1e6, "Taker Fees");
    }

    // All fees go to protocol (insurance fund + protocol balance)
    // No LP rewards, referrals, or token holder distributions
    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
        dailySupplySideRevenue: 0,
        dailyHoldersRevenue: 0,
    };
};

const methodology = {
    Fees: "Trading fees paid by makers and takers on each fill.",
    Revenue: "All fees are retained by the protocol (insurance fund + protocol balance).",
    ProtocolRevenue: "100% of trading fees go to the protocol.",
    SupplySideRevenue: "Perpl is an order-book DEX with no LP fee sharing.",
    HoldersRevenue: "No token holder fee distribution.",
};

const breakdownMethodology = {
    Fees: {
        "Maker Fees": "Fees paid by makers on each fill.",
        "Taker Fees": "Fees paid by takers on each fill.",
    },
    Revenue: {
        "Maker Fees": "Fees paid by makers on each fill.",
        "Taker Fees": "Fees paid by takers on each fill.",
    },
    ProtocolRevenue: {
        "Maker Fees": "Fees paid by makers on each fill.",
        "Taker Fees": "Fees paid by takers on each fill.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.MONAD],
    start: "2026-02-12",
    fetch,
    methodology,
    breakdownMethodology,
};

export default adapter;
