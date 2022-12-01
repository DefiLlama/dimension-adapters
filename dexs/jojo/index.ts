import { CHAIN } from "../../helpers/chains";
import { univ2DimensionAdapter } from "../../helpers/getUniSubgraph";

const DEFAULT_DAILY_VOLUME_FACTORY = "dailyVolume";
const DEFAULT_DAILY_DATE_FIELD = "date";
const DEFAULT_DAILY_VOLUME_FIELD = "dailyVolume";
const DEFAULT_TOTAL_VOLUME_FACTORY = "jojodealers";
const DEFAULT_TOTAL_VOLUME_FIELD = "totalVolumeUSD";

const adapter = univ2DimensionAdapter({
    graphUrls: {
        [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/kittyfu307/jojov1",
    },
    dailyVolume: {
        factory: DEFAULT_DAILY_VOLUME_FACTORY,
        field: DEFAULT_DAILY_VOLUME_FIELD,
        dateField: DEFAULT_DAILY_DATE_FIELD
    },
    totalVolume: {
        factory: DEFAULT_TOTAL_VOLUME_FACTORY,
        field: DEFAULT_TOTAL_VOLUME_FIELD
    }
}, {});

adapter.adapter.bsc.start = async () => 22088074;
export default adapter;
