import { Adapter, FetchResult, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";
import { adapterBitqueryFeesEthereumNetwork, ITx } from "../helpers/bitqueryFees";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";

const startTime = 1577836800;

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const startTimestamp = getTimestampAtStartOfDayUTC(startTime);
  const tillTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const form = new Date(startTimestamp * 1000).toISOString().split('T')[0];
  const till = new Date((tillTimestamp - 1) * 1000).toISOString();
  const result: ITx[] = await adapterBitqueryFeesEthereumNetwork(form, till, "klaytn");
  const totalFees = result.filter((a: ITx) => new Date(a.date.date).getTime() <= new Date(till).getTime()).reduce((a: number, b: ITx)=> a + b.gasValue, 0);
  const dailyFees = result.find((a: ITx) => (getTimestampAtStartOfDayUTC(new Date(a.date.date).getTime()) /1000) === getTimestampAtStartOfDayUTC(new Date(dayTimestamp).getTime()))?.gasValue
  const price_id = 'coingecko:klay-token'
  const price = (await getPrices([price_id], dayTimestamp))[price_id].price;
  const dailyFeesUsd = (dailyFees || 0) * price;
  const totalFeesUsd = (totalFees * price)
  return {
    timestamp,
    totalFees: totalFeesUsd.toString(),
    dailyFees: dailyFeesUsd.toString()
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.KLAYTN]: {
        fetch: fetch,
        start: async ()  => 1577836800,
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
