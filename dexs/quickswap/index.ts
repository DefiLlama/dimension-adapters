import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL"

const endpoints = {
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/sameepsi/quickswap06",
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: "date"
  },
});

const endpointsV3 = {
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/sameepsi/quickswap-v3",
  // [CHAIN.DOGECHAIN]: "https://graph-node.dogechain.dog/subgraphs/name/quickswap/dogechain-info",
  [CHAIN.POLYGON_ZKEVM]:"https://api.studio.thegraph.com/query/44554/quickswap-v3-02/0.0.7"
};
const graphsV3 = getChainVolume({
  graphUrls: endpointsV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
    dateField: "date"
  },
});


const fetchLiquidityHub = async (timestamp: number) => {
    let dailyResult = (await fetchURL('https://hub.orbs.network/analytics-daily/v1')).data;

    let rows = dailyResult.result.rows;
    let lastDay = rows[rows.length - 1];
    let dailyVolume = lastDay.daily_received_calculated_value;
    let totalVolume = (await fetchURL(`https://hub.orbs.network/analytics/v1`)).data.result.rows[0].total_calculated_value;

    return {
        dailyVolume: `${dailyVolume}`,
        totalVolume: `${totalVolume}`,
        timestamp: timestamp,
    };

}


const adapter: BreakdownAdapter = {
  breakdown: {
    v2: {
      [CHAIN.POLYGON]: {
        fetch: graphs(CHAIN.POLYGON),
        start: async () => 1602118043
      },
    },
    v3: {
      [CHAIN.POLYGON]: {
        fetch: graphsV3(CHAIN.POLYGON),
        start: async () => 1662425243
      },
      // [CHAIN.DOGECHAIN]: {
      //   fetch: graphsV3(CHAIN.DOGECHAIN),
      //   start: async () => 1660694400
      // },
      [CHAIN.POLYGON_ZKEVM]: {
        fetch: graphsV3(CHAIN.POLYGON_ZKEVM),
        start: async () => 1679875200
      },
    },
    liquidityHub: {
      [CHAIN.POLYGON]: {
        fetch: fetchLiquidityHub,
        start: async () => 1695042000
      },
    },
  },
};

export default adapter;
