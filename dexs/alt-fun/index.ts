import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { METRIC } from "../../helpers/metrics";

const ZAP = '0x693F12E9E6B35b34458793546065E8b08e0299d6';
const USDC = ADDRESSES.hyperliquid.USDC;

const FEE_BPS = 75n;
const PROTOCOL_FEE_BPS = 50n;
const BASIS_POINTS = 10000n;

const buyAbi = 'event Buy(address indexed token, address indexed buyer, uint256 usdcIn, uint256 tokensOut)';
const sellAbi = 'event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 usdcOut)';

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [buyLogs, sellLogs] = await Promise.all([
        options.getLogs({ target: ZAP, eventAbi: buyAbi }),
        options.getLogs({ target: ZAP, eventAbi: sellAbi }),
    ]);

    for (const log of buyLogs) {
        const usdcIn = BigInt(log.usdcIn);
        const fee = (usdcIn * FEE_BPS) / BASIS_POINTS;
        const protocol = (usdcIn * PROTOCOL_FEE_BPS) / BASIS_POINTS;
        dailyVolume.add(USDC, usdcIn);
        dailyFees.add(USDC, fee, METRIC.SWAP_FEES);
        dailyRevenue.add(USDC, protocol, 'Swap Fees to Protocol');
        dailySupplySideRevenue.add(USDC, fee - protocol, 'Swap Fees to creators');
    }

    for (const log of sellLogs) {
        // fee is already taken from usdcOut
        const usdcOut = BigInt(log.usdcOut);
        const gross = (usdcOut * BASIS_POINTS) / (BASIS_POINTS - FEE_BPS);
        const fee = gross - usdcOut;
        const protocol = (gross * PROTOCOL_FEE_BPS) / BASIS_POINTS;
        dailyVolume.add(USDC, gross);
        dailyFees.add(USDC, fee, METRIC.SWAP_FEES);
        dailyRevenue.add(USDC, protocol, 'Swap Fees to Protocol');
        dailySupplySideRevenue.add(USDC, fee - protocol, 'Swap Fees to creators');
    }

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
}

const methodology = {
    Volume: 'Total value of buys and sells routed through the Zap contract.',
    Fees: '0.75% fee on each buy and sell.',
    Revenue: '0.5% of each trade goes to the protocol.',
    ProtocolRevenue: '0.5% of each trade goes to the protocol.',
    SupplySideRevenue: '0.25% of each trade goes to the token creator.',
}

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: '0.75% fee on each buy and sell.',
    },
    Revenue: {
        'Swap Fees to Protocol': '0.5% of each trade goes to the protocol.',
    },
    ProtocolRevenue: {
        'Swap Fees to Protocol': '0.5% of each trade goes to the protocol.',
    },
    SupplySideRevenue: {
        'Swap Fees to creators': '0.25% of each trade goes to the token creator.',
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    start: '2026-05-14',
    methodology,
    breakdownMethodology,
};

export default adapter;
