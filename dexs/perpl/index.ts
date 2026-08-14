import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Dune query for fees and abi https://dune.com/queries/6960061/10872718
const EXCHANGE = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";
const CNS_DECIMALS = 1e6;

// The exchange renamed four events across two upgrades. Each V2 variant only APPENDS members,
// so its topic0 differs but every pre-existing field (and its byte offset) is unchanged. We match
// BOTH the V1 (pre-upgrade history) and V2 (current) forms so daily figures stay continuous across
// each upgrade block:
//   rc_v1.1.7.3 (block 78,499,562, 2026-06): PositionOpened->V2, PositionIncreased->V2 (append priceResiduePNSQ16)
//   rc_v1.1.7.4 (block 95,662,781, 2026-08-13): MakerOrderFilled->V2, TakerOrderFilled->V2 (append builderId, builderFeeCNS)
const abi = {
    // PositionOpened: insFeeCNS at word 8, protFeeCNS at word 9 (same in V1 and V2).
    positionOpenedTopicV1: "0xc0150ebb43a9c2478aa9c69d27078da071ceafb70e2d822d7d39a533e0418728",
    positionOpenedTopicV2: "0x04cc3d2fc73a9dca30eba1d05eca80b1b1216350243580027046f434fed4db18",
    // PositionIncreased: insFeeCNS at word 12, protFeeCNS at word 13 (same in V1 and V2).
    positionIncreasedTopicV1: "0x2a077a58d72570ce2b985a210c9ad672373eb9bcc337d1dc62b8b75dd644cf27",
    positionIncreasedTopicV2: "0x99a74f70c224396b9ba5fcd5a6e5f480db23e7a25a2b16a8c133ec2efb3e646c",
    makerOrderFilled: "event MakerOrderFilled(uint256 perpId, uint256 accountId, uint256 orderId, uint256 pricePNS, uint256 lotLNS, uint256 feeCNS, uint256 lockedBalanceCNS, int256 amountCNS, uint256 balanceCNS)",
    makerOrderFilledV2: "event MakerOrderFilledV2(uint256 perpId, uint256 accountId, uint256 orderId, uint256 pricePNS, uint256 lotLNS, uint256 feeCNS, uint256 lockedBalanceCNS, int256 amountCNS, uint256 balanceCNS, uint256 builderId, uint256 builderFeeCNS)",
    takerOrderFilled: "event TakerOrderFilled(uint256 entryPricePNS, uint256 collatPricePNS, uint256 pnlPricePNS, uint256 lotLNS, uint256 feeCNS, int256 amountCNS, uint256 balanceCNS)",
    takerOrderFilledV2: "event TakerOrderFilledV2(uint256 entryPricePNS, uint256 collatPricePNS, uint256 pnlPricePNS, uint256 lotLNS, uint256 feeCNS, int256 amountCNS, uint256 balanceCNS, uint256 builderId, uint256 builderFeeCNS)",
    getPerpetualInfo: "function getPerpetualInfo(uint256 perpId) view returns ((string name, string symbol, uint256 priceDecimals, uint256 lotDecimals, bytes32 linkFeedId, uint256 priceTolPer100K, uint256 marginTol, uint256 marginTolDecimals, uint256 refPriceMaxAgeSec, uint256 positionBalanceCNS, uint256 insuranceBalanceCNS, uint256 markPNS, uint256 markTimestamp, uint256 lastPNS, uint256 lastTimestamp, uint256 oraclePNS, uint256 oracleTimestampSec, uint256 longOpenInterestLNS, uint256 shortOpenInterestLNS))",
};

const fetch = async (options: FetchOptions) => {
    const [
        makerLogsV1, makerLogsV2, takerLogsV1, takerLogsV2,
        positionOpenedLogsV1, positionOpenedLogsV2,
        positionIncreasedLogsV1, positionIncreasedLogsV2,
    ] = await Promise.all([
        options.getLogs({ target: EXCHANGE, eventAbi: abi.makerOrderFilled }),
        options.getLogs({ target: EXCHANGE, eventAbi: abi.makerOrderFilledV2 }),
        options.getLogs({ target: EXCHANGE, eventAbi: abi.takerOrderFilled }),
        options.getLogs({ target: EXCHANGE, eventAbi: abi.takerOrderFilledV2 }),
        options.getLogs({ target: EXCHANGE, topics: [abi.positionOpenedTopicV1], entireLog: true }),
        options.getLogs({ target: EXCHANGE, topics: [abi.positionOpenedTopicV2], entireLog: true }),
        options.getLogs({ target: EXCHANGE, topics: [abi.positionIncreasedTopicV1], entireLog: true }),
        options.getLogs({ target: EXCHANGE, topics: [abi.positionIncreasedTopicV2], entireLog: true }),
    ]);

    // V1 (pre-upgrade) + V2 (current) forms of each event. V2 only appends members, so every field
    // read below (and every byte offset for the position events) is identical across both variants.
    const makerLogs = [...makerLogsV1, ...makerLogsV2];
    const takerLogs = [...takerLogsV1, ...takerLogsV2];
    const positionOpenedLogs = [...positionOpenedLogsV1, ...positionOpenedLogsV2];
    const positionIncreasedLogs = [...positionIncreasedLogsV1, ...positionIncreasedLogsV2];

    const markets: Record<number, { priceDecimals: number; lotDecimals: number }> = {};

    // Use the live market config for traded perpIds instead of stale hardcoded decimals.
    const perpIds = Array.from(new Set(makerLogs.map((log: any) => Number(log.perpId))));
    if (perpIds.length > 0) {
        const perpetualInfos = await options.api.multiCall({
            abi: abi.getPerpetualInfo,
            target: EXCHANGE,
            calls: perpIds.map((id) => ({ params: [id] })),
        });

        perpetualInfos.forEach((info: any, i: number) => {
            markets[perpIds[i]] = {
                priceDecimals: Number(info.priceDecimals),
                lotDecimals: Number(info.lotDecimals),
            };
        });
    }

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyUserFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    // Volume from maker fills only (one per trade, avoids double-counting)
    for (const log of makerLogs) {
        const perpId = Number(log.perpId);
        const market = markets[perpId];
        if (!market) {
            throw new Error(`Perpl: unknown perpId ${perpId}`);
        }

        const price = Number(log.pricePNS) / 10 ** market.priceDecimals;
        const lots = Number(log.lotLNS) / 10 ** market.lotDecimals;
        dailyVolume.addUSDValue(price * lots);

        // Maker fees in AUSD (6 decimals, 1:1 USD)
        const fee = Number(log.feeCNS) / CNS_DECIMALS;
        dailyFees.addUSDValue(fee, "Maker Fees");
        dailyUserFees.addUSDValue(fee, "Maker Fees");
        dailyRevenue.addUSDValue(fee, "Maker Fees");
        dailyProtocolRevenue.addUSDValue(fee, "Maker Fees");
    }

    // Taker fees (separate fee charged to taker side)
    for (const log of takerLogs) {
        const fee = Number(log.feeCNS) / CNS_DECIMALS;
        dailyFees.addUSDValue(fee, "Taker Fees");
        dailyUserFees.addUSDValue(fee, "Taker Fees");
        dailyRevenue.addUSDValue(fee, "Taker Fees");
        dailyProtocolRevenue.addUSDValue(fee, "Taker Fees");
    }

    // The position fee topics are not publicly ABI-matched; these word indexes mirror the Dune query.
    positionOpenedLogs.forEach((log: any) => {
        const data = log.data.slice(2);
        const insuranceFee = Number(BigInt(`0x${data.slice(8 * 64, 9 * 64)}`)) / CNS_DECIMALS;
        const protocolFee = Number(BigInt(`0x${data.slice(9 * 64, 10 * 64)}`)) / CNS_DECIMALS;
        dailyFees.addUSDValue(insuranceFee, "Position Insurance Fees");
        dailyUserFees.addUSDValue(insuranceFee, "Position Insurance Fees");
        dailySupplySideRevenue.addUSDValue(insuranceFee, "Position Insurance Fees");
        dailyFees.addUSDValue(protocolFee, "Position Protocol Fees");
        dailyUserFees.addUSDValue(protocolFee, "Position Protocol Fees");
        dailyRevenue.addUSDValue(protocolFee, "Position Protocol Fees");
        dailyProtocolRevenue.addUSDValue(protocolFee, "Position Protocol Fees");
    });

    positionIncreasedLogs.forEach((log: any) => {
        const data = log.data.slice(2);
        const insuranceFee = Number(BigInt(`0x${data.slice(12 * 64, 13 * 64)}`)) / CNS_DECIMALS;
        const protocolFee = Number(BigInt(`0x${data.slice(13 * 64, 14 * 64)}`)) / CNS_DECIMALS;
        dailyFees.addUSDValue(insuranceFee, "Position Insurance Fees");
        dailyUserFees.addUSDValue(insuranceFee, "Position Insurance Fees");
        dailySupplySideRevenue.addUSDValue(insuranceFee, "Position Insurance Fees");
        dailyFees.addUSDValue(protocolFee, "Position Protocol Fees");
        dailyUserFees.addUSDValue(protocolFee, "Position Protocol Fees");
        dailyRevenue.addUSDValue(protocolFee, "Position Protocol Fees");
        dailyProtocolRevenue.addUSDValue(protocolFee, "Position Protocol Fees");
    });

    // Insurance fees go to supply side; all other tracked fees go to protocol revenue.
    // No LP rewards, referrals, or token holder distributions
    return {
        dailyVolume,
        dailyFees,
        dailyUserFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "All fees paid by traders on Perpl: maker fees, taker fees, protocol fees, and insurance fund fees.",
    UserFees: "All fees paid by traders on Perpl.",
    Revenue: "Fees kept by the protocol, excluding the portion sent to the insurance fund.",
    ProtocolRevenue: "Fees kept by the protocol.",
    SupplySideRevenue: "Fees sent to the insurance fund.",
};

const breakdownMethodology = {
    Fees: {
        "Maker Fees": "Fees paid by maker orders when trades are filled.",
        "Taker Fees": "Fees paid by taker orders when trades are filled.",
        "Position Insurance Fees": "Fees paid into the insurance fund when positions are opened or increased.",
        "Position Protocol Fees": "Protocol fees paid when positions are opened or increased.",
    },
    UserFees: {
        "Maker Fees": "Fees paid by maker orders when trades are filled.",
        "Taker Fees": "Fees paid by taker orders when trades are filled.",
        "Position Insurance Fees": "Fees paid into the insurance fund when positions are opened or increased.",
        "Position Protocol Fees": "Protocol fees paid when positions are opened or increased.",
    },
    Revenue: {
        "Maker Fees": "Maker fees kept by the protocol.",
        "Taker Fees": "Taker fees kept by the protocol.",
        "Position Protocol Fees": "Position protocol fees kept by the protocol.",
    },
    ProtocolRevenue: {
        "Maker Fees": "Maker fees kept by the protocol.",
        "Taker Fees": "Taker fees kept by the protocol.",
        "Position Protocol Fees": "Position protocol fees kept by the protocol.",
    },
    SupplySideRevenue: {
        "Position Insurance Fees": "Insurance fees sent to the insurance fund.",
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
