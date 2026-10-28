import { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Meridian ExchangeGateway proxy. Trade and fee events are emitted here by the delegated PerpEngine module.
const EXCHANGE_GATEWAY = "0xD540F47F214dC7D6D244E62A6aE7e06B586Ef44A";

const FEE_ACCRUED_EVENT = "event FeeAccrued(address indexed account, bytes32 indexed subaccount, address token, uint256 feeAmount, uint256 balance, uint64 messageIdx)";

const ORDER_MATCHED_EVENT = "event PerpOrderMatched(uint32 indexed productId, address indexed maker, address indexed taker, bytes32 makerSubaccount, bytes32 takerSubaccount, uint8 makerSide, uint8 takerSide, uint128 fillQuantity, uint128 price, uint128 makerFee, uint128 takerFee, uint64 messageIdx)";

// quantities, prices and fees use 9 decimals; all collateral tokens are USD-equivalents backed by USDe
const SCALE = 1e9;

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailyVolume = options.createBalances();

    const feeAccruedLogs = await options.getLogs({ target: EXCHANGE_GATEWAY, eventAbi: FEE_ACCRUED_EVENT });
    const orderMatchedLogs = await options.getLogs({ target: EXCHANGE_GATEWAY, eventAbi: ORDER_MATCHED_EVENT });

    feeAccruedLogs.forEach((fee: any) => {
        dailyFees.addCGToken("ethena-usde", Number(fee.feeAmount) / SCALE);
    });

    orderMatchedLogs.forEach((order: any) => {
        dailyVolume.addCGToken("ethena-usde", (Number(order.fillQuantity) / SCALE) * (Number(order.price) / SCALE));
    });

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
}

const methodology = {
    Volume: "Notional volume of Meridian perp trades",
    Fees: "All trading fees paid by users",
    Revenue: "All fees are revenue",
    ProtocolRevenue: "All revenue goes to the protocol",
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ROBINHOOD],
    methodology,
    start: '2026-08-28',
};

export default adapter;
