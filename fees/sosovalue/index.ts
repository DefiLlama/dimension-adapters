// https://sosovalue.gitbook.io/sosovalue-indices/resources/faq

import * as sdk from "@defillama/sdk";
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

// SetFeeTokenset carries the whole unclaimed fee balance, not the fee of the day: collectFeeTokenset() adds the
// day's fee to it and burnFeeTokenset() takes the claimed part out, both emitting the new balance (AssetToken
// implementation https://repo.sourcify.dev/8453/0x9fBF0775f1740078e93E488C1DfEa9a2065B5d5F). The fee is the
// per-token increase between consecutive balances of the same index token; decreases are claims, not fees.
const ASSET_FACTORY = '0xb04eB6b64137d1673D46731C8f84718092c50B0D';
const getFeeTokensetAbi = 'function getFeeTokenset() view returns ((string chain, string symbol, string addr, uint8 decimals, uint256 amount)[])';
const tokenKey = ([chain, symbol, addr, decimals]: any) => `${chain}:${symbol}:${addr}:${decimals}`;

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const assetIds = await options.api.call({ target: ASSET_FACTORY, abi: 'function getAssetIDs() view returns (uint256[])' });
    const indexTokens = await options.api.multiCall({ target: ASSET_FACTORY, abi: 'function assetTokens(uint256) view returns (address)', calls: assetIds });

    const logs = await options.getLogs({
        targets: indexTokens,
        eventAbi: 'event SetFeeTokenset((string chain, string symbol, string addr, uint8 decimals, uint256 amount)[] feeTokenset)',
        onlyArgs: false,
    });
    logs.sort((a: any, b: any) => a.blockNumber - b.blockNumber || (a.logIndex ?? a.index) - (b.logIndex ?? b.index));

    // Balance of each index token before its first event in this window, then updated event by event.
    const balances: Record<string, Record<string, bigint>> = {};
    for (const log of logs) {
        const indexToken = log.address.toLowerCase();
        if (!balances[indexToken]) {
            const openingTokenset = await sdk.api2.abi.call({
                chain: options.chain,
                target: indexToken,
                abi: getFeeTokensetAbi,
                block: log.blockNumber - 1,
            });
            balances[indexToken] = {};
            openingTokenset.forEach((token: any) => { balances[indexToken][tokenKey(token)] = BigInt(token[4]); });
        }
        const previous = balances[indexToken];
        balances[indexToken] = {};

        log.args.feeTokenset.forEach((tokenData: any) => {
            const [chainStr, _symbol, addr, _decimalsFromLog, total] = tokenData;
            balances[indexToken][tokenKey(tokenData)] = BigInt(total);
            const increase = BigInt(total) - (previous[tokenKey(tokenData)] ?? 0n);
            if (increase <= 0n) return;
            const amount = increase.toString();

            const mappedChainData = chainMapping[chainStr];
            if (!mappedChainData) {
                throw new Error(`Chain ${chainStr} not found in mapping`);
            }

            if (addr && addr !== '') {
                const tokenIdentifier = `${mappedChainData.chain}:${addr}`;
                dailyFees.add(tokenIdentifier, amount, 'Indexes Services Fees', { skipChain: true });
            } else if (mappedChainData.gasCgTokenId) {
                const adjustedAmount = Number(amount) / (10 ** Number(_decimalsFromLog));
                dailyFees.addCGToken(mappedChainData.gasCgTokenId, adjustedAmount, 'Indexes Services Fees');
            } else {
                // If there's no address and no gas token ID, we cannot process the fee.
                throw new Error(`Cannot process fee for chain ${chainStr}`);
            }
        });
    }

    return {
        dailyFees,
        dailyRevenue: dailyFees.clone(),
        dailyProtocolRevenue: dailyFees.clone(),
        dailyHoldersRevenue: 0
    };
};

export default {
    version: 2,
    pullHourly: true,
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
    breakdownMethodology: {
        Fees: {
            'Indexes Services Fees': 'The protocol charges a daily service fee of 0.01% based on the value of the underlying assets',
        },
        Revenue: {
            'Indexes Services Fees': 'The protocol charges a daily service fee of 0.01% based on the value of the underlying assets',
        },
        ProtocolRevenue: {
            'Indexes Services Fees': 'The protocol charges a daily service fee of 0.01% based on the value of the underlying assets',
        },
    },
};
