import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
const feeMaangerContract = "0x90a022796798f9dbA1Da0f8645234B284d4E8EC6";

const arbitrumPools = [
    //aave
    "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8",
    "0x6ab707Aca953eDAeFBc4fD23bA73294241490620",
    "0x724dc807b04555b71ed48a6896b6F41593b8C637",
    "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE",
    //native
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    "0x5979D7b546E38E414F7E9822514be443A4800529",
];

const fetch: any = async ({ api, fromApi, createBalances, }: FetchOptions) => {
    const dailyFees = createBalances()
    const totalFees = createBalances()
    const feeAmounts = await api.multiCall({ abi: "function feeTokens(address) view returns (uint256)", target: feeMaangerContract, calls: arbitrumPools, permitFailure: true, });
    const feeAmountsADayAgo = await fromApi.multiCall({ abi: "function feeTokens(address) view returns (uint256)", target: feeMaangerContract, calls: arbitrumPools, permitFailure: true, });


    dailyFees.add(arbitrumPools, feeAmounts.map(i => i ?? 0));
    totalFees.add(arbitrumPools, feeAmounts.map(i => i ?? 0));
    dailyFees.add(arbitrumPools, feeAmountsADayAgo.map(i => (i ?? 0) * -1));

    return { dailyFees, totalFees, }
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [ARBITRUM]: {
            fetch,
            start: 1727740800,
        },
    },
};

export default adapter;
