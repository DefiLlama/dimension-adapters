
import { Adapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const statsCache: any = {};

const methodology = {
  Volume: "Maker/taker volume that flow through the interface",
  Fees: "Builder Fees collected from BSC Network",
  Revenue: "builder fees",
  ProtocolRevenue: "All the revenue go to the protocol",
};

const BROKER_ID = "honeypot";
const REVENUE_RATIO = 1;
const PROTOCOL_REVENUE_RATIO = 1;
const START = "2025-11-01";

export function hpotAdaptorBuilder(): Adapter {
  const url = `https://api.orderly.org/md/volume/builder/daily_stats?broker_id=${BROKER_ID}`;
  console.log("hpotAdaptor");
  async function fetch(_: any, _1: any, { dateString }: FetchOptions) {
    console.log(dateString);
    if (!statsCache[BROKER_ID])
      statsCache[BROKER_ID] = httpGet(url).then((data) => {
        const dateDataMap: any = {};
        data.forEach((i: any) => {
          dateDataMap[i.date.slice(0, 10)] = i;
        });
        return dateDataMap;
      });

    const data = (await statsCache[BROKER_ID])[dateString];

    if (!data) throw new Error("Data missing for date: " + dateString);

    const dailyVolume = +data.takerVolume + +data.makerVolume;
    const dailyFees = +data.builderFee;
    const dailyRevenue = dailyFees * REVENUE_RATIO;
    const dailyProtocolRevenue = dailyRevenue * PROTOCOL_REVENUE_RATIO;

    const response: any = {
      dailyVolume,
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
    };

    if (REVENUE_RATIO < 1)
      response.dailySupplySideRevenue = dailyFees - dailyRevenue;

    if (PROTOCOL_REVENUE_RATIO < 1)
      response.dailyHoldersRevenue = dailyRevenue - dailyProtocolRevenue;

    return response;
  }

  return {
    version: 1,
    chains: [CHAIN.BSC],
    start: START,
    methodology,
    fetch,
    doublecounted: true,
  };
}

const adapter = hpotAdaptorBuilder() as SimpleAdapter;

adapter.adapter = {
  [CHAIN.BSC]: {
    start: "2025-11-01",
    fetch: async function (_: any, _1: any, options: FetchOptions) {
      return await (adapter.fetch as any)(_, _1, options);
    },
  },
};

export default adapter;
