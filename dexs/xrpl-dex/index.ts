import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (options: FetchOptions) => {
    const formattedDate = options.dateString

    const query = `select dex_xrp_pair_volume_xrp,amm_xrp_volume_xrp from xrpl.aggregated_metrics_daily where date = Date('${formattedDate}')`;
    const queryResults = await queryDuneSql(options, query);

    if (!queryResults.length) {
        throw new Error(`no row in xrpl.aggregated_metrics_daily for ${formattedDate} yet`);
    }

    const dexVolumeXrp = queryResults[0].dex_xrp_pair_volume_xrp;
    const ammVolumeXrp = queryResults[0].amm_xrp_volume_xrp;

    const dailyVolume = options.createBalances();
    dailyVolume.addCGToken("ripple", Number(ammVolumeXrp) + Number(dexVolumeXrp));

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.RIPPLE],
    start: '2025-03-19',
    isExpensiveAdapter: true,
};

export default adapter;
