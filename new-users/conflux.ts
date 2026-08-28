import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_BASE = "https://evmapi.confluxscan.io/api";

const fetch = async (options: FetchOptions) => {
    const dateString = options.dateString;
    const prevDay = new Date(new Date(dateString).getTime() - 86400000).toISOString().slice(0, 10);
    const data = await fetchURL(`${API_BASE}?module=stats&action=dailynewaddress&startdate=${prevDay}&enddate=${dateString}`);
    if (!Array.isArray(data?.result))
        throw new Error(`Conflux: API error for ${dateString}`);
    const entry = data.result.find((e: any) => e.UTCDate === dateString);
    if (!entry) throw new Error(`Conflux: no new-address entry for ${dateString}`);
    return {
        dailyNewUsers: entry.newAddressCount,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.CONFLUX],
    start: "2022-02-20",
    protocolType: ProtocolType.CHAIN,
};

export default adapter;
