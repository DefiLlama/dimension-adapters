import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const HYPERION_BASE = "https://eos.hyperion.eosrio.io/v2/history/get_actions?account=";

interface VaultaAction {
    act: {
        data: {
            from: string;
            to: string;
            amount: number;
            quantity: string;
            memo: string;
        };
    };
}

interface VaultaResponse {
    actions: VaultaAction[];
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyVolume = options.createBalances();
    const startTime = options.startTimestamp;
    const endTime = options.endTimestamp;
    const startDate = new Date(startTime * 1000).toISOString();
    const endDate = new Date(endTime * 1000).toISOString();

    // Track RAM buys and sells - transfers TO and FROM eosio.ram
    const url = `${HYPERION_BASE}eosio.ram&filter=eosio.token:transfer&after=${startDate}&before=${endDate}&limit=1000`;
    const response: VaultaResponse = await fetchURL(url);
    let totalVolume = 0;
    if (response?.actions) {
        for (const action of response.actions) {
            const { from, to, memo, quantity } = action.act.data;
            const amount = parseFloat(quantity.split(' ')[0]);

            if (to === "eosio.ram" && memo?.toLowerCase().includes("buy ram")) {
                totalVolume += amount;
            } else if (from === "eosio.ram" && memo?.toLowerCase().includes("sell ram")) {
                totalVolume += amount;
            }
        }
    }
    if (totalVolume > 0) {
        dailyVolume.addCGToken("eos", totalVolume);
    }

    return {
        dailyFees: dailyVolume.clone(0.005), // 0.5% of trade volume as fees
        dailyRevenue: dailyVolume.clone(0.005),
        dailyVolume
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.EOS]: {
            fetch,
            start: "2018-06-14",
        },
    },
    methodology: {
        Fees: "0.5% fee charged on all RAM trading (buys and sells) collected in eosio.ramfee",
        Revenue: "All RAM trading fees are revenue",
        Volume: "Total value of RAM bought and sold on the Vaulta RAM market"
    },
};

export default adapter;