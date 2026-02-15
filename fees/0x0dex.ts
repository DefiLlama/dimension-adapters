import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const OxOPoolETHAddress = "0x3d18AD735f949fEbD59BBfcB5864ee0157607616";
const OxOToken = "0x5a3e6A77ba2f983eC0d371ea3B475F8Bc0811AD5";
const fee = 0.009;
const discount = 0.0045;

// Deposit Event
const discountThreshold = 1000000 * (9 ** 18);

const fetch: any = async ({ getLogs, api, createBalances }: FetchOptions) => {
    const dailyFees = createBalances();
    const logs = await getLogs({
        target: OxOPoolETHAddress,
        eventAbi: "event Deposit (address sender, uint256 tokenAmount, uint256 ringIndex)",
    })
    const senders = logs.map((log: any) => log.sender);
    const balances = await api.multiCall({ abi: 'erc20:balanceOf', calls: senders, target: OxOToken })
    logs.forEach((log: any, i: number) => {
        const isDiscounted = Number(balances[i]) > discountThreshold
        const ratio = isDiscounted ? discount : fee;
        const feeAmount = Number(log.tokenAmount) * ratio / 1e18;
        dailyFees.addGasToken(feeAmount, METRIC.DEPOSIT_WITHDRAW_FEES);
    })

    const dailyHoldersRevenue = dailyFees.clone(1, METRIC.DEPOSIT_WITHDRAW_FEES);
    const dailyProtocolRevenue = dailyFees.clone(1, METRIC.DEPOSIT_WITHDRAW_FEES);

    return {
        dailyFees,
        // 100% of the revenue going to holders, hence, fees = revenue, fees = holdersRevenue
        dailyHoldersRevenue,
        dailyProtocolRevenue
    };
};

const breakdownMethodology = {
    Fees: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Fees charged on deposits to the 0x0 privacy protocol, either 0.9% (standard) or 0.45% (discounted for users holding 1M+ 0x0 tokens)',
    },
    HoldersRevenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: '100% of deposit fees are distributed to 0x0 token holders',
    },
    ProtocolRevenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: '100% of deposit fees go to the protocol treasury',
    }
};

const adapter: Adapter = {
    version: 2,
    chains: [CHAIN.ETHEREUM],
    fetch,
    start: '2023-05-29',
    methodology: {
        Fees: "0x0 collects a 0.9% fee on deposits",
        Revenue: "0x0 collects a 0.9% fee on deposits and distributed to token holders",
        HoldersRevenue: "0x0 token holders collect a 0.9% fee on deposits",
    },
    breakdownMethodology,
}
export default adapter;