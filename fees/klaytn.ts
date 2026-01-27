import { Adapter, ChainBlocks, FetchOptions, FetchResult, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { adapterBitqueryFeesEthereumNetwork, ITx } from "../helpers/bitqueryFees";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";

const startTime = 1577836800;

const fetch = async (_timestamp: number , _: ChainBlocks, { createBalances, startOfDay }: FetchOptions): Promise<FetchResult> => {
  const dailyFees = createBalances()
  const startTimestamp = getTimestampAtStartOfDayUTC(startTime);
  const tillTimestamp = getTimestampAtStartOfNextDayUTC(startOfDay);
  const form = new Date(startTimestamp * 1000).toISOString().split('T')[0];
  const till = new Date((tillTimestamp - 1) * 1000).toISOString();
  const result: ITx[] = await adapterBitqueryFeesEthereumNetwork(form, till, "klaytn");
  const _dailyFees = result.find((a: ITx) => (getTimestampAtStartOfDayUTC(new Date(a.date.date).getTime()) /1000) === getTimestampAtStartOfDayUTC(new Date(startOfDay).getTime()))?.gasValue
  if (!_dailyFees) return { timestamp: startOfDay,  };
  dailyFees.addGasToken(_dailyFees * 1e18);

  return {
    dailyFees,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.KLAYTN]: {
        fetch,
        start: '2020-01-01',
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
