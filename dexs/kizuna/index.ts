// https://api.goldsky.com/api/public/project_clmqdcfcs3f6d2ptj3yp05ndz/subgraphs/kizuna-amm/1.0.0/gn
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.MODE]: "https://api.goldsky.com/api/public/project_clmqdcfcs3f6d2ptj3yp05ndz/subgraphs/kizuna-amm/1.0.0/gn"
}, {});

export default adapters;
