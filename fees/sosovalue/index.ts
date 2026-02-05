// https://sosovalue.gitbook.io/sosovalue-indices/resources/faq

import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainMapping: { [key: string]: { chain: CHAIN; gasCgTokenId: string | null } } = {
    'ETH': { chain: CHAIN.ETHEREUM, gasCgTokenId: 'ethereum' },
    'SOL': { chain: CHAIN.SOLANA, gasCgTokenId: 'solana' },
    'BSC_BNB': { chain: CHAIN.BSC, gasCgTokenId: 'binancecoin' },
    'BASE_ETH': { chain: CHAIN.BASE, gasCgTokenId: 'ethereum' },
    'DOGE': { chain: CHAIN.DOGECHAIN, gasCgTokenId: 'dogecoin' },
    'BTC': { chain: CHAIN.BITCOIN, gasCgTokenId: 'bitcoin' },
    'XRP': { chain: CHAIN.RIPPLE, gasCgTokenId: 'ripple' },
    'ADA': { chain: CHAIN.CARDANO, gasCgTokenId: 'cardano' },
    'HYPEREVM_HYPE': { chain: CHAIN.HYPERLIQUID, gasCgTokenId: 'hyperliquid' },
};

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const logs = await options.getLogs({
        noTarget: true,
        topic: '0xff3230afb6342b834472ce477d29346e00de72df80243109b963c7bc0f9ec578',
        eventAbi: 'event SetFeeTokenset((string chain, string symbol, string addr, uint8 decimals, uint256 amount)[] feeTokenset)'
    });

    logs.forEach(log => {
        const feeTokenset = log.feeTokenset;
        feeTokenset.forEach((tokenData: any) => {
            const [chainStr, _symbol, addr, _decimalsFromLog, amount] = tokenData;
            
            const mappedChainData = chainMapping[chainStr];
            if (!mappedChainData) {
                throw new Error(`Chain ${chainStr} not found in mapping`);
            }

            if (addr && addr !== '') {
                const tokenIdentifier = `${mappedChainData.chain}:${addr}`;
                dailyFees.add(tokenIdentifier, amount, { skipChain: true });
            } else if (mappedChainData.gasCgTokenId) {
                const adjustedAmount = Number(amount) / (10 ** Number(_decimalsFromLog));
                dailyFees.addCGToken(mappedChainData.gasCgTokenId, adjustedAmount);
            } else {
                // If there's no address and no gas token ID, we cannot process the fee.
                throw new Error(`Cannot process fee for chain ${chainStr}`);
            }
        });
    });

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
        dailyHoldersRevenue: 0
    };
};

export default {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: '2024-12-17',
        }
    },
    methodology: {
        Fees: 'The protocol charges a daily service fee of 0.01% based on the value of the underlying assets.',
        Revenue: 'All services fees paid by users.',
        ProtocolRevenue: 'All services fees are collected by SoSoValue protocol.',
        HoldersRevenue: 'No holder revenue, only emissions as staking rewards',
    },
};
