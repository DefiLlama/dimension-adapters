import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const LIST_URL = "https://api.enzyme.finance/enzyme.enzyme.v1.EnzymeService/GetVaultList";
const ENZYME_FEE_TRACKER = "0xe97980f1D43C4CD4F1EeF0277a2DeA7ddBc2Cd13";
const feePaidEventAbi = "event FeePaidForVault (address indexed vaultProxy, uint256 sharesAmount, uint256 secondsPaid)";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const { vaults } = await httpPost(LIST_URL, {}, {
        headers: {
            Authorization: `Bearer 9b9b20f6-4108-444f-b69b-b5183e435ad5`
        }
    });

    const feePaidLogs = await options.getLogs({
        target: ENZYME_FEE_TRACKER,
        eventAbi: feePaidEventAbi,
    });

    const vaultFeePaidMap = new Map();

    feePaidLogs.forEach((log: any) => {
        const { vaultProxy, sharesAmount } = log;
        const feePaidForTokenSoFar = vaultFeePaidMap.get(vaultProxy) || 0;
        vaultFeePaidMap.set(vaultProxy, feePaidForTokenSoFar + Number(sharesAmount));
    });

    const vaultPriceMap: Map<string, number> = new Map(vaults.map((vault: any) => [vault.address, vault.sharePrice]));

    const vaultDecimals = await options.api.multiCall({
        abi: 'uint8:decimals',
        calls: [...vaultFeePaidMap.keys()]
    });

    let index = 0;
    for (const [vaultAddress, dailyFeePaid] of vaultFeePaidMap.entries()) {
        dailyFees.addUSDValue((dailyFeePaid / (10 ** vaultDecimals[index])) * (vaultPriceMap.get(vaultAddress.toLowerCase()) || 0));
        index++;
    }

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }

};

const methodology = {
    Fees: "Includes all the fees recieved by fee recipient for index management",
    Revenue: "All the fees are revenue",
    ProtocolRevenue: "All the fees go to protocol treasury"
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.ETHEREUM],
    methodology,
    runAtCurrTime: true,
};

export default adapter;