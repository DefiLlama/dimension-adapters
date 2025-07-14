import {
    FetchOptions,
    FetchResult,
    SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TokensPurchasedEvent =
    "event TokensPurchased(address indexed token, address indexed buyer, uint256 hypeIn, uint256 tokensOut, uint256 price, uint256 timestamp, uint256 hypeReserves, uint256 tokenReserves, uint256 totalSupply, string name, string symbol)";

const TokensSoldEvent =
    "event TokensSold(address indexed token, address indexed seller, uint256 tokensIn, uint256 hypeOut, uint256 price, uint256 timestamp, uint256 hypeReserves, uint256 tokenReserves, uint256 totalSupply, string name, string symbol)";

const BondFeeCollectedEvent =
    "event BondFeeCollected(address indexed token, address indexed feeRecipient, uint256 feeAmount, uint256 timestamp)";

const FeesClaimedEvent =
    "event FeesClaimed(address indexed token, uint256 indexed nftTokenId, address indexed claimer, uint256 hypeAmount, uint256 deployerShare, uint256 feeRecipientShare, uint256 tokensBurned)";

const LIQUIDLAUNCH_ADDRESS = "0xDEC3540f5BA6f2aa3764583A9c29501FeB020030";
const HYPE_ADDRESS = "0x5555555555555555555555555555555555555555"; // Native HYPE token address

const fetch: any = async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    // Get TokensPurchased events
    const purchaseLogs = await options.getLogs({
        target: LIQUIDLAUNCH_ADDRESS,
        eventAbi: TokensPurchasedEvent,
    });
    
    for (const purchaseLog of purchaseLogs) {
        // Add volume from hypeIn
        dailyVolume.add(HYPE_ADDRESS, purchaseLog.hypeIn);
        
        // Add fees (1% of hypeIn)
        const feeAmount = purchaseLog.hypeIn / 100n; // 1% fee using BigInt
        dailyFees.add(HYPE_ADDRESS, feeAmount);
    }

    // Get TokensSold events
    const saleLogs = await options.getLogs({
        target: LIQUIDLAUNCH_ADDRESS,
        eventAbi: TokensSoldEvent,
    });
    
    for (const saleLog of saleLogs) {
        // Add volume from hypeOut
        dailyVolume.add(HYPE_ADDRESS, saleLog.hypeOut);
        
        // Add fees (1% of hypeOut)
        const feeAmount = saleLog.hypeOut / 100n; // 1% fee using BigInt
        dailyFees.add(HYPE_ADDRESS, feeAmount);
    }

    // Get BondFeeCollected events
    const bondFeeLogs = await options.getLogs({
        target: LIQUIDLAUNCH_ADDRESS,
        eventAbi: BondFeeCollectedEvent,
    });
    
    for (const bondFeeLog of bondFeeLogs) {
        // Add bond fees directly
        dailyFees.add(HYPE_ADDRESS, bondFeeLog.feeAmount);
    }

    // Get FeesClaimed events
    const feesClaimedLogs = await options.getLogs({
        target: LIQUIDLAUNCH_ADDRESS,
        eventAbi: FeesClaimedEvent,
    });
    
    for (const feesClaimedLog of feesClaimedLogs) {
        // Add fees from hype amount claimed
        dailyFees.add(HYPE_ADDRESS, feesClaimedLog.hypeAmount);
    }

    return { 
        dailyVolume,
        dailyFees,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch: fetch,
            start: "2025-01-01",
            meta: {
                methodology: {
                    Volume: "Volume is calculated from hypeIn amounts in TokensPurchased events and hypeOut amounts in TokensSold events.",
                    Fees: "Fees are calculated as 1% of hypeIn from TokensPurchased events, 1% of hypeOut from TokensSold events, feeAmount from BondFeeCollected events, and hypeAmount from FeesClaimed events.",
                },
            },
        },
    },
};

export default adapter; 