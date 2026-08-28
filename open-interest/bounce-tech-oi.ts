// Bounce - Leveraged Tokens on HyperEVM (Open Interest)
//
// Open Interest = sum of notional across all leveraged token contracts
//
// Contract resolution chain:
//   GlobalStorage.factory()                   → Factory address
//   GlobalStorage.hyperliquidHandler()        → HyperliquidHandler address
//   Factory.lts()                             → All deployed LeveragedToken addresses
//   HyperliquidHandler.notionalUsdc(lt)       → Actual position notional per token
//   LeveragedToken.isLong()                   → Long vs short side

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";

const GLOBAL_STORAGE = '0xa07d06383c1863c8A54d427aC890643d76cc03ff';
const USDC = '0xb88339CB7199b77E23DB6E890353E22632Ba630f'; // notionalUsdc precompile always returns 6-decimal USDC

const fetch = async (options: FetchOptions) => {
    const factory = await options.api.call({ abi: 'address:factory', target: GLOBAL_STORAGE });
    const handler = await options.api.call({ abi: 'address:hyperliquidHandler', target: GLOBAL_STORAGE });

    const lts: string[] = await options.api.call({ abi: 'address[]:lts', target: factory });

    //using ethers as alchemy fails to precompile on hyperevm
    const handlerContract = new ethers.Contract(handler, ['function notionalUsdc(address user) view returns (uint256)'], options.api.provider);
    const notionals = await Promise.all(lts.map(lt => handlerContract.notionalUsdc(lt)));
    const isLongs = await options.api.multiCall({ abi: 'bool:isLong', calls: lts });

    const openInterestAtEnd = options.createBalances();
    const longOpenInterestAtEnd = options.createBalances();
    const shortOpenInterestAtEnd = options.createBalances();

    lts.forEach((_lt, i) => {
        const notional = BigInt(notionals[i]);
        openInterestAtEnd.add(USDC, notional);
        if (isLongs[i]) longOpenInterestAtEnd.add(USDC, notional);
        else shortOpenInterestAtEnd.add(USDC, notional);
    });

    return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
};

const adapter: SimpleAdapter = {
    version: 2,
    chains: [CHAIN.HYPERLIQUID],
    fetch,
    start: '2026-01-28',
};

export default adapter;
