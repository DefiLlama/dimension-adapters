import * as sdk from "@defillama/sdk";
import axios from "axios";
import {CHAIN} from "../../helpers/chains";
import {getTimestampAtStartOfDayUTC} from "../../utils/date";

const STATUS = {
    FILLED: "FILLED",
};

const SUBGRAPHS = {
    pdex: sdk.graph.modifyEndpoint('6tn8tNYxKCEM5bTceMfA5jeGm3gtCrUGDwbKN7QGGat4'),
};

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

const calculate24hTimestamps = (timestamp: number) => {
    const startOfCurrentDay = getTimestampAtStartOfDayUTC(timestamp);
    const endOfCurrentDay = startOfCurrentDay + 24 * 60 * 60;
    return {
        startOfCurrentDay,
        endOfCurrentDay,
    };
};

const generateOrdersQuery = (timeStart: number = 0, timeEnd: number, skip: number = 0, first: number = 1000) => {
    return {
        query: `
        {
          orders(
            where: {
              submissionTimestamp_gt: "${timeStart}",
              submissionTimestamp_lt: "${timeEnd}",
              status: FILLED
            },
            first: ${first},
            skip: ${skip},
            orderBy: submissionTimestamp,
            orderDirection: asc
          ) {
              id
              side
              type
              status
              submissionTimestamp
              collateralValue
              sizeChange
              updateType
              owner
          }
        }`
    };
};

const queryOrders = async (timestamp: number) => {
    const timeStart = 0;
    const timeEnd = timestamp;
    const orders: Array<any> = [];
    const pageSize = 1000;
    let hasMoreData = true;
    while (hasMoreData) {
        const query = generateOrdersQuery(timeStart, timeEnd, orders.length, pageSize);
        const response = await axios.post(SUBGRAPHS.pdex, query);
        const fetchedOrders = response?.data?.data?.orders;
        if (!fetchedOrders) {
            hasMoreData = false;
            continue;
        }
        orders.push(...fetchedOrders);
        hasMoreData = fetchedOrders.length === pageSize;
    }

    return orders;
};

const getOrders = async (timestamp: number) => {
    return queryOrders(timestamp);
};

const calculateTradingVolumeFromOrders = (orders: Array<any>, timestamp: number) => {
    const filteredOrders = orders.filter(
        order => order.status === STATUS.FILLED
    );
    const {startOfCurrentDay, endOfCurrentDay} = calculate24hTimestamps(timestamp);
    const filteredOrders24h = filteredOrders.filter(
        order => order.submissionTimestamp >= startOfCurrentDay
            && order.submissionTimestamp <= endOfCurrentDay
    );
    const tradingVolume = filteredOrders.reduce(
        (acc, order) => acc + toBigInt(order.sizeChange),
        toBigInt(0)
    );
    const tradingVolume24h = filteredOrders24h.reduce(
        (acc, order) => acc + toBigInt(order.sizeChange),
        toBigInt(0)
    );
    return {
        tradingVolume,
        tradingVolume24h,
    };
};

const fetchVolumeStats = async (timestamp: number) => {
    const {startOfCurrentDay, endOfCurrentDay} = calculate24hTimestamps(timestamp);
    const orders = await getOrders(endOfCurrentDay);
    const {tradingVolume, tradingVolume24h} = calculateTradingVolumeFromOrders(orders, startOfCurrentDay);
    const [
        convertedTradingVolume24h,
    ] = [tradingVolume, tradingVolume24h].map(value => convertToUsd(value));
    return {
        timestamp,
        dailyVolume: convertedTradingVolume24h.toString(),
    };
};

export default {
    adapter: {
        [CHAIN.BSC]: {
            fetch: fetchVolumeStats,
            start: '2023-12-04',
        },
    },
};
