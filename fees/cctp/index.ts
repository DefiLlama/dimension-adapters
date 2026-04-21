import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const CCTP_MESSENGER = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d';
const MINT_AND_WITHDRAW_EVENT = 'event MintAndWithdraw (address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected)'

//chains can be found here: https://bridge.usdc.com/api/feature-flags
const chainConfig = {
    [CHAIN.BASE]: { start: '2025-02-10' },
    [CHAIN.AVAX]: { start: '2025-02-10' },
    [CHAIN.ETHEREUM]: { start: '2025-02-11' },
    [CHAIN.LINEA]: { start: '2025-03-07' },
    [CHAIN.ARBITRUM]: { start: '2025-04-03' },
    [CHAIN.SONIC]: { start: '2025-04-30' },
    [CHAIN.WC]: { start: '2025-05-15' },
    [CHAIN.OPTIMISM]: { start: '2025-05-15' },
    [CHAIN.POLYGON]: { start: '2025-06-09' },
    [CHAIN.UNICHAIN]: { start: '2025-06-11' },
    //[CHAIN.SEI]: { start: '2025-06-25' },
    [CHAIN.PLUME]: { start: '2025-08-08' },
    [CHAIN.HYPERLIQUID]: { start: '2025-08-11' },
    [CHAIN.XDC]: { start: '2025-08-21' },
    [CHAIN.INK]: { start: '2025-08-21' },
    [CHAIN.MONAD]: { start: '2025-09-15' },
}

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances()

    const mintAndWithdrawLogs = await options.getLogs({
        target: CCTP_MESSENGER,
        eventAbi: MINT_AND_WITHDRAW_EVENT,
    })

    mintAndWithdrawLogs.forEach(log => {
        dailyFees.add(log.mintToken, log.feeCollected, "Bridge Fees");
    })

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Fast transfer fees(0-14 BPs) and forward fees charged by CCTP",
    UserFees: "Fast transfer fees(0-14 BPs) and forward fees paid by users for bridging USDC",
    Revenue: "All the fees are revenue",
    HoldersRevenue: "All the revenue goes to the protocol",
}

const breakdownMethodology = {
    Fees: {
        'Bridge Fees': 'Fast transfer fees(0-14 BPs) and forward fees charged by CCTP',
    },
    Revenue: {
        'Bridge Fees': 'Fast transfer fees(0-14 BPs) and forward fees charged by CCTP',
    },
    ProtocolRevenue: {
        'Bridge Fees': 'Fast transfer fees(0-14 BPs) and forward fees charged by CCTP',
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    adapter: chainConfig,
    methodology,
    breakdownMethodology,
}

export default adapter