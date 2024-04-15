import {Adapter, FetchResult} from "../../adapters/types";
import {BSC} from "../../helpers/chains";
import {ethers} from "ethers";
import axios from "axios";

export const SUBGRAPHS = {
    pdex: "https://api.thegraph.com/subgraphs/name/crypnosis/swych-pdex-v1",
};

const contractAddresses = {
    Pool: "0xF86f70fb4959a9FCF1e7dD67A05dC0AC95c3802d",
    Oracle: "0xe4460109425EbC1CE34cAd59Ab7ce60535956BF5",
};

const PoolABI = [
    "function feeReserves(address token) view returns (uint256)",
];

const OracleABI = [
    "function getPrice(address token, bool useCache) view returns (uint256)",
];

const feeTokenList = Object.values([
    "0x55d398326f99059fF775485246999027B3197955",
    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
]);

const toBigInt = (value: string | number) => {
    return BigInt(value);
};

const convertToUsd = (value: bigint, decimals = 30) => {
    if (!value) {
        return 0;
    }

    const wei = toBigInt(10) ** toBigInt(decimals);
    return Number(value / wei);
};

const generateWithdrawalFeesQuery = (timeStart = 0, skip = 0, limit = 1000) => {
    return {
        query: `
            {
              feeWithdrawals(
                first: ${limit}
                skip: ${skip}
                orderBy: timestamp
                orderDirection: asc
                where: {timestamp_gt: "${timeStart}"}
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

const fetchWithdrawalFees = async () => {
    const data = [];
    const pageSize = 1000;
    let hasMoreData = true;

    while (hasMoreData) {
        const query = generateWithdrawalFeesQuery(0, data.length, pageSize);
        const response = await axios.post(SUBGRAPHS.pdex, query);
        const fetchedData = response?.data?.data?.feeWithdrawals;
        if (!fetchedData) {
            hasMoreData = false;
            continue;
        }
        data.push(...fetchedData);
        hasMoreData = fetchedData.length === pageSize;
    }

    return data;
};

const fetchTotalProtocolRevenue = async () => {
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
    const Pool = new ethers.Contract(contractAddresses.Pool, PoolABI, provider);
    const Oracle = new ethers.Contract(contractAddresses.Oracle, OracleABI, provider);
    const fees = await Promise.all(feeTokenList.map(async (token) => {
        const fee: bigint = await Pool.feeReserves(token);
        const tokenPrice: bigint = await Oracle.getPrice(token, true);
        return fee * tokenPrice;
    })).then(
        (values) => values.reduce((a, b) => a + b, toBigInt(0))
    );
    return convertToUsd(fees);
};

const fetchFees = async () => {
    const totalRevenue = await fetchTotalProtocolRevenue();
    const totalWithdrawalFeeData = await fetchWithdrawalFees();
    const totalWithdrawalFees = totalWithdrawalFeeData.reduce((acc, fee) => acc + fee.amount, toBigInt(0));
    const totalWithdrawalFeesUsd = convertToUsd(totalWithdrawalFees);
    const totalFees = totalRevenue + totalWithdrawalFeesUsd;

    return {
        totalFees
    } as FetchResult;
};

const adapter: Adapter = {
    adapter: {
        [BSC]: {
            fetch: fetchFees,
            start: 1701720000,
            meta: {
                methodology: {
                    Fees: 'Swych collects fees from different transactions done on the Perpetual Exchange.',
                },
            },
        },
    },
}

export default adapter
