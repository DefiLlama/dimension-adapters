import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dateString = options.dateString;
    const feeData = await fetchURL(`https://api.routescan.io/v2/network/mainnet/evm/4337/etherscan/api?module=stats&action=dailytxnfee`);
    if (!Array.isArray(feeData?.result))
        throw new Error(`Beam: invalid Routescan response (expected array, got ${typeof feeData?.result})`);
    const feeToday = feeData.result.find((fee: any) => fee.UTCDate === dateString);
    if (!feeToday) {
        throw new Error(`Beam: no fee data for ${dateString}`);
    }

    dailyFees.addCGToken("beam-2", +feeToday.transactionFee_Eth);
    return { dailyFees };
}

const adapter: Adapter = {
    version: 1,
    fetch,
    chains: [CHAIN.BEAM],
    start: "2023-08-14",
    protocolType: ProtocolType.CHAIN,
};

export default adapter;
