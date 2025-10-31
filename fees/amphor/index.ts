import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { ETHEREUM } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';

const AmphorILHedgedWETH_contractAddress: string = '0xcDC51F2B0e5F0906f2fd5f557de49D99c34Df54e';
const AmphorLRTwstETHVault_contractAddress: string = '0x06824C27C8a0DbDe5F72f770eC82e3c0FD4DcEc3';
const AmphorPTezETHVault_contractAddress: string = '0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1';
const AmphorPTrsETHVault_contractAddress: string = '0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E';
const AmphorPTweETHVault_contractAddress: string = '0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966';

const methodology = {
    UserFees: "Include performance fees.",
    Fees: "Includes all treasury revenue.",
    ProtocolRevenue: "Share of revenue going to Amphor treasury.",
    Revenue: "Sum of protocol revenue.",
}
const event = 'event EpochEnd(uint256 indexed timestamp,uint256 lastSavedBalance,uint256 returnedAssets,uint256 fees,uint256 totalShares)'
const addresss: string[] = [
    AmphorILHedgedWETH_contractAddress,
    AmphorLRTwstETHVault_contractAddress,
    AmphorPTezETHVault_contractAddress,
    AmphorPTrsETHVault_contractAddress,
    AmphorPTweETHVault_contractAddress
]
const data = async (options: FetchOptions): Promise<FetchResultV2> => {
    const logs = (await options.getLogs({
        targets: addresss,
        eventAbi: event,
        flatten: true
    }))

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()

    const TOKENS = {
        WETH: ADDRESSES.ethereum.WETH,
    }

    logs.forEach((log) => {
        dailyFees.add(TOKENS.WETH, log.fees)
        if (log.fees > 0) {
            dailyRevenue.add(TOKENS.WETH, log.returnedAssets - log.lastSavedBalance)
        }
    })
    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyFees,
    }
}

const adapter: Adapter = {
    adapter: {
        [ETHEREUM]: {
            fetch: data,
            start: '2023-10-06',
        }
    },
    version: 2,
    methodology
}

export default adapter;
