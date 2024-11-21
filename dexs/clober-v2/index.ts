import type {SimpleAdapter} from "../../adapters/types";
import {FetchOptions, FetchResultV2, FetchV2} from "../../adapters/types";
import {getTimestampAtStartOfDayUTC} from "../../utils/date"
import {CHAIN} from "../../helpers/chains";
import {CONTRACT_INFOS} from "./const";

const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp)

    const dailyVolume = options.createBalances()

    const bookInfos: any = {}
    const CONTRACT_INFO = CONTRACT_INFOS[options.chain];

    const openEvents = await options.getLogs({
        target: CONTRACT_INFO.bookManagerContract.address,
        fromBlock: CONTRACT_INFO.bookManagerContract.fromBlock,
        eventAbi: CONTRACT_INFO.bookManagerContract.abi.openEvent,
        onlyArgs: true,
    })
    for (const open of openEvents) {
        const bookId = open.id;
        bookInfos[bookId] = {
            quote: open.quote,
            unitSize: open.unitSize,
        }
    }

    const dailyTakeEvents = await options.getLogs({
        target: CONTRACT_INFO.bookManagerContract.address,
        eventAbi: CONTRACT_INFO.bookManagerContract.abi.takeEvent,
        onlyArgs: true,
    })
    const takeEvents = [
        {
            events: dailyTakeEvents,
            volume: dailyVolume,
        },
    ]
    for (const {events, volume} of takeEvents) {
        for (const take of events) {
            const bookId = take.bookId;
            const bookInfo = bookInfos[bookId];
            if (!bookInfo) {
                continue;
            }
            const quote = bookInfo.quote;
            const quoteVolume = take.unit * bookInfo.unitSize;
            volume.add(quote, quoteVolume);
        }
    }

    return {
        dailyVolume: dailyVolume,
        timestamp: dayTimestamp,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch: fetch,
            // runAtCurrTime: true,
            start: '2024-06-12',
            meta: {
                methodology: 'Volume is calculated by summing the quote token volume of all trades on the protocol.',
            }
        },
        [CHAIN.ERA]: {
            fetch: fetch,
            // runAtCurrTime: true,
            start: '2024-06-12',
            meta: {
                methodology: 'Volume is calculated by summing the quote token volume of all trades on the protocol.',
            }
        },
    }
};

export default adapter;
