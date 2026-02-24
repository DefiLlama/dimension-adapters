import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const OxOPoolETHAddress = "0x3d18AD735f949fEbD59BBfcB5864ee0157607616";
const OxOToken = "0x5a3e6A77ba2f983eC0d371ea3B475F8Bc0811AD5";
const fee = 0.009;
const discount = 0.0045;

// Deposit Event
const discountThreshold = 1000000 * (9 ** 18);

const fetch: any = async ({ getLogs, api,}: FetchOptions) => {
    const logs = await getLogs({
        target: OxOPoolETHAddress,
        eventAbi: "event Deposit (address sender, uint256 tokenAmount, uint256 ringIndex)", 
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
        dailyFees,
        // 100% of the revenue going to holders, hence, fees = revenue, fees = holdersRevenue
        dailyHoldersRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2023-05-29',
        }
    },
    methodology: {
        Fees: "0x0 collects a 0.9% fee on deposits",
        Revenue: "0x0 collects a 0.9% fee on deposits and distributed to token holders",
        HoldersRevenue: "0x0 token holders collect a 0.9% fee on deposits",
    }
}
export default adapter;