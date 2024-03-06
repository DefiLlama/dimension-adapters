import { Adapter, FetchOptions, FetchResult } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";

const OxOPoolETHAddress = "0x3d18AD735f949fEbD59BBfcB5864ee0157607616";
const OxOToken = "0x5a3e6A77ba2f983eC0d371ea3B475F8Bc0811AD5";
const fee = 0.009;
const discount = 0.0045;

// Deposit Event
const discountThreshold = 1000000 * (9 ** 18);

const fetch: any = async (timestamp: number, _: any, { getLogs, api }: FetchOptions): Promise<FetchResult> => {
    const logs = await getLogs({
        target: OxOPoolETHAddress,
        eventAbi: "event Deposit (address sender, uint256 tokenAmount, uint256 ringIndex)"
    })
    const senders = logs.map((log: any) => log.sender);
    const balances = await api.multiCall({ abi: 'erc20:balanceOf', calls: senders, target: OxOToken })
    let dailyFees = 0;
    logs.forEach((log: any, i: number) => {
        const isDiscounted = Number(balances[i]) > discountThreshold
        const ratio = isDiscounted ? discount : fee;
        dailyFees += Number(log.tokenAmount) * ratio;
    })
    dailyFees /= 1e18;

    return {
        timestamp,
        dailyFees,
        // 100% of the revenue going to holders, hence, fees = revenue, fees = holdersRevenue
        dailyHoldersRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees
    };
};

const adapter: Adapter = {
    adapter: {
        [ETHEREUM]: {
            fetch,
            runAtCurrTime: true,
            start: 1685386800,
            meta: {
                methodology: {
                    Fees: "0x0 collects a 0.9% fee on deposits"
                }
            }
        }
    }
}
export default adapter;