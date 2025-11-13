import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const RAIN_PROTOCOL_FACTORY = "0xccCB3C03D9355B01883779EF15C1Be09cf3623F1";
const RAIN_PROTOCOL_USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"; // USDT token address on Arbitrum

const PlatformFeeClaimEvent = "event PlatformClaim(address indexed wallet, uint256 amount)"; // USDT burnt as fees
const PoolCreatedEvent = "event PoolCreated(address indexed poolAddress, address indexed poolCreator, string uri)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const pools: any[] = await options.getLogs({
        target: RAIN_PROTOCOL_FACTORY,
        eventAbi: PoolCreatedEvent,
    });
    for (const log of pools) {
        const poolAddress = log.poolAddress;
        const feeLogs: any[] = await options.getLogs({
            target: poolAddress,
            eventAbi: PlatformFeeClaimEvent,
        });
        for (const feeLog of feeLogs) {
            dailyFees.add(RAIN_PROTOCOL_USDT, feeLog.amount);
        }
    }
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
    Fees: 'All fees paid by users for each pool in USDT via Rain Protocol Markets.',
    Revenue: 'Fees are used to buy back and burn RAIN Token.',
    ProtocolRevenue: 'Fees are used to buy back and burn RAIN Token.',
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ARBITRUM],
    start: "2025-02-17",
    methodology
}

export default adapter;