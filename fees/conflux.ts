import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_BASE = "https://evmapi.confluxscan.io/api";

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dateString = options.dateString;
    const prevDay = new Date(new Date(dateString).getTime() - 86400000).toISOString().slice(0, 10);
    const feeData = await fetchURL(`${API_BASE}?module=stats&action=dailytxnfee&startdate=${prevDay}&enddate=${dateString}`);
    if (!Array.isArray(feeData?.result))
        throw new Error(`Conflux: API error for ${dateString}`);
    const feeToday = feeData.result.find((fee: any) => fee.UTCDate === dateString);
    if (feeToday) {
        dailyFees.addCGToken("conflux-token", Number(feeToday.transactionFee_CFX));
    }
    return { dailyFees };
}

const adapter: Adapter = {
    version: 1,
    fetch,
    chains: [CHAIN.CONFLUX],
    start: "2022-02-20",
    protocolType: ProtocolType.CHAIN,
    methodology: {
        Fees: "Transaction fees paid by users on Conflux eSpace",
    },
};

export default adapter;
