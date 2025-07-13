import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from '../../helpers/coreAssets.json'

const fetch = async (options: FetchOptions) => {
    const dailyBurn = await addTokensReceived({
        options,
        tokens: ["0x046EeE2cc3188071C02BfC1745A6b17c656e3f3d"], //RLB
        targets: [ADDRESSES.null] //Burn address
    });
    // 90% burn , rest 10% distributed to holders via lottery
    return { dailyHoldersRevenue: dailyBurn.clone(1 / 0.9) }
}

const meta = {
    methodology: {
        HoldersRevenue: "10% of casino , 20% of sport , 30 % of trading revenue goes to RLB buy-back. Out of which 90% is burnt and 10% is distributed among RLB and rollbot stakers",
    }
}

export default {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: "2023-10-18",
            meta
        }
    }
};