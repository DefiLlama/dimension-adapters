import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultVolume } from "../../adapters/types";
import { getPrices } from "../../utils/prices";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const date = new Date(Number(options) * 1000);
    const formattedDate = date.toISOString().split("T")[0];

    const query = `select dex_xrp_pair_volume_xrp,amm_xrp_volume_xrp from xrpl.aggregated_metrics_daily where date = Date('${formattedDate}')`;
    const queryResults = await queryDuneSql(options, query);

    const dexVolumeXrp = queryResults.length > 0 ? queryResults[0].dex_xrp_pair_volume_xrp : 0;
    const ammVolumeXrp = queryResults.length > 0 ? queryResults[0].amm_xrp_volume_xrp : 0;

    const XRP = "coingecko:ripple"
    const xrpPrice = await getPrices([XRP], Number(options));

    return {
        dailyVolume: (Number(ammVolumeXrp) + Number(dexVolumeXrp)) * xrpPrice[XRP].price,
    };
};


const adapter: any = {
    version: 1,
    adapter: {
        [CHAIN.RIPPLE]: {
            fetch,
            start: '2025-03-19',
        },
    },
};

export default adapter;
