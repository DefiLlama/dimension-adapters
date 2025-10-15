import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const date = new Date(options.fromTimestamp * 1000);
    const formattedDate = date.toISOString().split("T")[0];

    const query = `select dex_xrp_pair_volume_xrp,amm_xrp_volume_xrp from xrpl.aggregated_metrics_daily where date = Date('${formattedDate}')`;
    const queryResults = await queryDuneSql(options, query);

    const dexVolumeXrp = queryResults.length > 0 ? queryResults[0].dex_xrp_pair_volume_xrp : 0;
    const ammVolumeXrp = queryResults.length > 0 ? queryResults[0].amm_xrp_volume_xrp : 0;

    const dailyVolume = options.createBalances();
    dailyVolume.addCGToken("ripple", Number(ammVolumeXrp) + Number(dexVolumeXrp));

    return { dailyVolume };
};

const adapter: any = {
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.RIPPLE],
    start: '2025-03-19',
};

export default adapter;
