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
    const endTime = startTime + 86400;
    const startDate = new Date(startTime * 1000).toISOString();
    const endDate = new Date(endTime * 1000).toISOString();

    // Track RAM buys - transfers TO eosio.ram
    const buyUrl = `${HYPERION_BASE}eosio.ram&filter=eosio.token:transfer&transfer.to=eosio.ram&after=${startDate}&before=${endDate}&limit=1000`;
    const buyResponse: VaultaResponse = await fetchURL(buyUrl);
    let buyVolume = 0;
    if (buyResponse?.actions) {
        const filteredBuys = buyResponse.actions.filter(action =>
            action.act.data.memo?.toLowerCase().includes("buy ram")
        );

        for (const action of filteredBuys) {
            buyVolume += action.act.data.amount;
        }
    }

    // Track RAM sells - transfers FROM eosio.ram
    const sellUrl = `${HYPERION_BASE}eosio.ram&filter=eosio.token:transfer&transfer.from=eosio.ram&after=${startDate}&before=${endDate}&limit=1000`;
    const sellResponse: VaultaResponse = await fetchURL(sellUrl);
    let sellVolume = 0;
    if (sellResponse?.actions) {
        const filteredSells = sellResponse.actions.filter(action =>
            action.act.data.memo?.toLowerCase().includes("sell ram")
        );
        for (const action of filteredSells) {
            sellVolume += action.act.data.amount;
        }
    }

    // Note: ram fee is constant at 0.5% so we can calculate from volume
    // Track fees - transfers to eosio.ramfee with "ram fee" memo
    // const feesUrl = `${HYPERION_BASE}eosio.ramfee&filter=eosio.token:transfer&transfer.to=eosio.ramfee&after=${startDate}&before=${endDate}&limit=1000`;
    // const feesResponse: VaultaResponse = await fetchURL(feesUrl);
    // console.log("Fee transfers - total response length:", feesResponse?.actions?.length);
    // let totalFees = 0;
    // if (feesResponse?.actions) {
    //     const filteredFees = feesResponse.actions.filter(action =>
    //         action.act.data.memo?.toLowerCase().includes("ram fee")
    //     );
    //     console.log("Fee transfers - filtered by memo:", filteredFees.length);

    //     for (const action of filteredFees) {
    //         totalFees += action.act.data.amount;
    //     }
    // }
    // if (totalFees > 0) {
    //     console.log("Total fees:", totalFees);
    //     dailyFees.addCGToken("eos", totalFees);
    //     dailyRevenue.addCGToken("eos", totalFees);
    // }

    const totalVolume = buyVolume + sellVolume;
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
        Revenue: "All RAM trading fees are protocol revenue",
        Volume: "Total value of RAM bought and sold on the Vaulta RAM market"
    },
};

export default adapter;