import { httpGet } from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { ChainBlocks, SimpleAdapter } from "../../adapters/types";

const chainMap: Record<string, number> = {};

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
  const a = {};
  chainData.map((c: any) => {
    const chain =
      chainMap[c.displayName.toLowerCase()] ?? c.displayName.toLowerCase();
    a[chain] = { fetch: fetch(c.chainId), start: 1622544000 };
  });
  return a;
}

const adapter: SimpleAdapter = {
  adapter: async () => generateAdapter(),
};

export default adapter;
