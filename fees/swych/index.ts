import ADDRESSES from '../../helpers/coreAssets.json'
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

export const SUBGRAPHS = {
    pdex: sdk.graph.modifyEndpoint('6tn8tNYxKCEM5bTceMfA5jeGm3gtCrUGDwbKN7QGGat4'),
};

const contractAddresses = {
    Pool: "0xF86f70fb4959a9FCF1e7dD67A05dC0AC95c3802d",
    Oracle: "0xe4460109425EbC1CE34cAd59Ab7ce60535956BF5",
};

const event_incress_position = "event IncreasePosition(bytes32 indexed key,address account,address collateralToken,address indexToken,uint256 collateralValue,uint256 sizeChanged,uint8 side,uint256 indexPrice,uint256 feeValue)";
const event_decrease_position = "event DecreasePosition(bytes32 indexed key,address account,address collateralToken,address indexToken,uint256 collateralChanged,uint256 sizeChanged,uint8 side,uint256 indexPrice,uint256 pnl,uint256 feeValue)";
const event_liquidate_position = "event LiquidatePosition(bytes32 indexed key,address account,address collateralToken,address indexToken,uint8 side,uint256 size,uint256 collateralValue,uint256 reserveAmount,uint256 indexPrice,uint256 pnl,uint256 feeValue)";
const event_swap = "event Swap(address indexed sender,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,uint256 fee)";
interface FeeWithdrawal {
    amount: bigint;
    id: string;
    recipient: string;
    timestamp: number;
    token: string;
}

type TIsStable = {
    [key: string]: boolean;
}
const isStable: TIsStable = {
    [ADDRESSES.bsc.USDT]: true,
    [ADDRESSES.bsc.WBNB]: false,
    [ADDRESSES.bsc.BTCB]: false,
    [ADDRESSES.bsc.ETH]: false,
    "0x570a5d26f7765ecb712c0924e4de545b89fd43df": false,
}
const OracleABI = {
    getPrice: "function getPrice(address token, bool useCache) view returns (uint256)",
};

const generateWithdrawalFeesQuery = (timeStart = 0, endTime = 0, skip = 0, limit = 1000) => {
    return {
        query: `
            {
                feeWithdrawals(
                    first: ${limit}
                    skip: ${skip}
                    orderBy: timestamp
                    orderDirection: asc
                    where: {timestamp_gt: "${timeStart}" timestamp_lte: "${endTime}"}
                ) {
                    amount
                    id
                    recipient
                    timestamp
                    token
                }
            }`
    };
};

const fetchWithdrawalFees = async (timestamp: number): Promise<FeeWithdrawal[]> => {
    const data: FeeWithdrawal[] = [];
    const pageSize = 1000;
    const startTime = timestamp;
    const endTime = timestamp + 24 * 60 * 60;
    let hasMoreData = true;

    while (hasMoreData) {
        const query = generateWithdrawalFeesQuery(startTime, endTime, data.length, pageSize);
        const response = await axios.post(SUBGRAPHS.pdex, query);
        const fetchedData: FeeWithdrawal[] = response?.data?.data?.feeWithdrawals;
        if (!fetchedData) {
            hasMoreData = false;
            continue;
        }
        data.push(...fetchedData);
        hasMoreData = fetchedData.length === pageSize;
    }

    return data;
};

const fetchTotalProtocolRevenue = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const logs_incress_position = await options.getLogs({ target: contractAddresses.Pool, eventAbi: event_incress_position });
    const logs_decrease_position = await options.getLogs({ target: contractAddresses.Pool, eventAbi: event_decrease_position });
    const logs_liquidate_position = await options.getLogs({ target: contractAddresses.Pool, eventAbi: event_liquidate_position });
    const logs_swap = await options.getLogs({ target: contractAddresses.Pool, eventAbi: event_swap });
    logs_swap.forEach((log) => {
        const fee = Number(log.fee) / 1e30;
        dailyFees.addCGToken('tether', fee);
    })
    logs_incress_position.forEach((log) => {
        const fee = (Number(log.feeValue) / 1e30)
        dailyFees.addCGToken('tether', fee);
    })
    logs_decrease_position.forEach((log) => {
        const fee = (Number(log.feeValue) / 1e30)
        dailyFees.addCGToken('tether', fee);
    })
    logs_liquidate_position.forEach((log) => {
        const fee = (Number(log.feeValue) / 1e30)
        dailyFees.addCGToken('tether', fee);
    });
    return dailyFees;
};

const fetchFees = async (options: FetchOptions) => {
    const dailyFees = await fetchTotalProtocolRevenue(options);
    const totalWithdrawalFeeData = await fetchWithdrawalFees(options.startOfDay);
    const tokenWithdrawalFees = [...new Set(totalWithdrawalFeeData.map((fee) => fee.token))];
    const decimals: string[] = await options.api.multiCall({ abi: 'erc20:decimals', calls: tokenWithdrawalFees })
    totalWithdrawalFeeData.forEach((fee) => {
        const index = tokenWithdrawalFees.indexOf(fee.token);
        const token_decimal = Number(decimals[index]);
        const feeValue = Number(fee.amount) / 10 ** (30 - token_decimal)
        dailyFees.add(fee.token, feeValue);
    });
    return { dailyFees }
};

const adapter: Adapter = {
    methodology: {
        Fees: 'Swych collects fees from different transactions done on the Perpetual Exchange.',
    },
    version: 2,
    deadFrom: '2025-01-01',
    adapter: {
        [CHAIN.BSC]: {
            fetch: fetchFees,
            start: '2023-12-04',
        },
    },
}

export default adapter
