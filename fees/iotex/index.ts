import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const IOTEX_SUM_GAS_URL = "https://gateway1.iotex.me/analyzer/sumGasFeeIotx";

const fetch = async ({ createBalances, toTimestamp }: FetchOptions) => {
  const dailyFees = createBalances()
  const today = new Date(getTimestampAtStartOfDayUTC(toTimestamp) * 1000)
    .toISOString()
    .split("T")[0];

  const result = await httpGet(`${IOTEX_SUM_GAS_URL}?start_date=${today}&end_date=${today}`);
  dailyFees.addCGToken('iotex', parseFloat(result))

  return {
    dailyFees,
    dailyRevenue: 0,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.IOTEX],
  start: "2021-06-22",
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
