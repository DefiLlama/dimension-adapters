import { FetchOptions, SimpleAdapter, FetchV2, FetchResultV2 } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const OrderFilledEvent = "event OrderFilled(bytes32 indexed orderHash,address indexed trader,address indexed perp,int256 orderFilledPaperAmount,int256 filledCreditAmount,uint256 positionSerialNum,int256 fee)";
const PositionFinalizeLogEvent = "event PositionFinalizeLog(address indexed trader, int256 paperAmount, int256 creditAmount, int256 fee, int256 pnl, string perp)"

const degenDealerAddress = '0xb7ffeaf4af97aece3c9ae7e5f68b9cd66d02f8ac';
const perpAddress = '0x2f7c3cF9D9280B165981311B822BecC4E05Fe635';
const getFetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
    const { createBalances, getLogs, api } = options
    const dailyFees = createBalances()
    const orderLogs = await getLogs({
        target: perpAddress,
        eventAbi: OrderFilledEvent,
    })
    const positionFinalizeLog = await getLogs({
        target: degenDealerAddress,
        eventAbi: PositionFinalizeLogEvent,
    })
    orderLogs.forEach(log => dailyFees.addUSDValue(Math.abs(Number(log.fee) / Number(1e6))))
    positionFinalizeLog.forEach(log => dailyFees.addUSDValue(Math.abs(Number(log.fee) / Number(1e6))))
    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const adapter: SimpleAdapter = {
    methodology: {
        Fees: 'Total trading fees paid by users.',
        Revenue: 'Total trading fees paid by users.',
        ProtocolRevenue: 'Total trading fees paid by users.',
    },
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch: getFetch,
            start: '2024-04-09',
        }
    }
}

export default adapter
