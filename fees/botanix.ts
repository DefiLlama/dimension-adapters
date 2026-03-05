import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dateString = options.dateString;
    const feeData = await fetchURL(`https://api.routescan.io/v2/network/mainnet/evm/3637/etherscan/api?module=stats&action=dailytxnfee`);
    if (!Array.isArray(feeData?.result))
        throw new Error(`Botanix: invalid Routescan response (expected array, got ${typeof feeData?.result})`);
    const feeToday = feeData.result.find((fee: any) => fee.UTCDate === dateString);
    if (!feeToday) {
        throw new Error(`Botanix: no fee data for ${dateString}`);
    }

    dailyFees.addCGToken("bitcoin", +feeToday.transactionFee_Eth);
    return { dailyFees };
}

const adapter: Adapter = {
    version: 1,
    start: "2025-05-22",
    fetch,
    chains: [CHAIN.BOTANIX],
    protocolType: ProtocolType.CHAIN,
};

export default adapter;
