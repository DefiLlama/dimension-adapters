import { httpGet } from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { ChainBlocks } from "../../adapters/types";

const chainMap: Record<string, string> = {
  "bnb chain": CHAIN.BSC,
  "polygon pos": CHAIN.POLYGON,
  "polygon zkevm": CHAIN.POLYGON_ZKEVM,
  "zksync era": CHAIN.ERA,
};

const fetch =
  (chainId: number) => async (timestamp: number, _: ChainBlocks) => {
    const unixTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000),
    );
    const url = `https://common-service.kyberswap.com/api/v1/aggregator/volume/daily?chainId=${chainId}&timestamps=${unixTimestamp}`;
    const data = (
      await httpGet(url, {
        headers: { origin: "https://common-service.kyberswap.com" },
      })
    ).data?.volumes?.[0];

    return {
      dailyVolume: data.value,
      timestamp: timestamp,
    };
  };

async function generateAdapter() {
  const chainData = (
    await httpGet(
      `https://common-service.kyberswap.com/api/v1/aggregator/supported-chains`,
    )
  ).data.chains;
  
  const adapter = {};
  chainData.map((c: any) => {
    if (["196", "25", "199", "81457", "324"].includes(c.chainId)) return;
    const chain =
      chainMap[c.displayName.toLowerCase()] ?? c.displayName.toLowerCase();
    adapter[chain] = { fetch: fetch(c.chainId), start: 1622544000 };
  });

  return adapter;
}

export default {
  adapter: async () => generateAdapter(),
};
