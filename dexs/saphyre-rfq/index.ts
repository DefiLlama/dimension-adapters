import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_BASE = "https://rfq.saphyre.xyz";

const fetch = async (_t: any, _b: any, { startOfDay }: any) => {
    const res = await httpGet(`${API_BASE}/api/v1/analytics/volume?period=all&chain_id=1329`);
    const point = res.data_points.find((p: any) => p.timestamp === startOfDay);
    return { dailyVolume: point?.volume ?? 0 };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SEI]: { fetch, start: "2025-03-01" },
    },
};

export default adapter;
