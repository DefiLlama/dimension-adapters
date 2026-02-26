import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TokensPurchasedEvent =
    "event TokensPurchased(address indexed token, address indexed buyer, uint256 hypeIn, uint256 tokensOut, uint256 price, uint256 timestamp, uint256 hypeReserves, uint256 tokenReserves, uint256 totalSupply, string name, string symbol)";

const TokensSoldEvent =
    "event TokensSold(address indexed token, address indexed seller, uint256 tokensIn, uint256 hypeOut, uint256 price, uint256 timestamp, uint256 hypeReserves, uint256 tokenReserves, uint256 totalSupply, string name, string symbol)";

const BondFeeCollectedEvent =
    "event BondFeeCollected(address indexed token, address indexed feeRecipient, uint256 feeAmount, uint256 timestamp)";

const FeesClaimedEvent =
    "event FeesClaimed(address indexed token, uint256 indexed nftTokenId, address indexed claimer, uint256 hypeAmount, uint256 deployerShare, uint256 feeRecipientShare, uint256 tokensBurned)";

const RewardAddedEvent =
    "event RewardAdded(uint256 amount, address indexed from)";

const LIQUIDLAUNCH_ADDRESS = "0xDEC3540f5BA6f2aa3764583A9c29501FeB020030";
const STAKING_CONTRACT_ADDRESS = "0x27a9760F866DCdc655eD117c85D5592f8b4CDD1B";
const HYPE_ADDRESS = "0x5555555555555555555555555555555555555555"; // Native HYPE token address

const fetch: any = async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    let totalProtocolFees = 0n; // Fees that should go to protocol (and then to stakers)
    let totalDeployerFees = 0n; // Fees that go to token deployers
    let holdersRevenueAmount = 0n; // What actually got sent to stakers

    // Get TokensPurchased events - 1% fee, all to protocol
    const purchaseLogs = await options.getLogs({
        target: LIQUIDLAUNCH_ADDRESS,
        eventAbi: TokensPurchasedEvent,
    });

    for (const purchaseLog of purchaseLogs) {
        // Add volume from hypeIn
        dailyVolume.add(HYPE_ADDRESS, purchaseLog.hypeIn);

        // Add fees (1% of hypeIn) - all to protocol
        const feeAmount = purchaseLog.hypeIn / 100n;
        dailyFees.add(HYPE_ADDRESS, feeAmount);
        totalProtocolFees += feeAmount;
    }

    // Get TokensSold events - 1% fee, all to protocol
    const saleLogs = await options.getLogs({
        target: LIQUIDLAUNCH_ADDRESS,
        eventAbi: TokensSoldEvent,
    });

    for (const saleLog of saleLogs) {
        // Add volume from hypeOut
        dailyVolume.add(HYPE_ADDRESS, saleLog.hypeOut);

        // Add fees (1% of hypeOut) - all to protocol
        const feeAmount = saleLog.hypeOut / 100n;
        dailyFees.add(HYPE_ADDRESS, feeAmount);
        totalProtocolFees += feeAmount;
    }

    // Get BondFeeCollected events - 20 HYPE split: 15 to protocol, 5 to deployer
    const bondFeeLogs = await options.getLogs({
        target: LIQUIDLAUNCH_ADDRESS,
        eventAbi: BondFeeCollectedEvent,
    });

    for (const bondFeeLog of bondFeeLogs) {
        // Total bond fee
        dailyFees.add(HYPE_ADDRESS, bondFeeLog.feeAmount);

        // Assuming 20 HYPE bond fee: 15 to protocol, 5 to deployer
        const protocolShare = (bondFeeLog.feeAmount * 75n) / 100n; // 75% = 15/20
        const deployerShare = (bondFeeLog.feeAmount * 25n) / 100n;  // 25% = 5/20

        totalProtocolFees += protocolShare;
        totalDeployerFees += deployerShare;
    }

    // Get FeesClaimed events - 50% to deployer, 50% to protocol
    const feesClaimedLogs = await options.getLogs({
        target: LIQUIDLAUNCH_ADDRESS,
        eventAbi: FeesClaimedEvent,
    });

    for (const feesClaimedLog of feesClaimedLogs) {
        // Total LP fees claimed
        dailyFees.add(HYPE_ADDRESS, feesClaimedLog.hypeAmount);

        // Split 50/50: deployerShare and feeRecipientShare should be in the event
        const deployerShare = feesClaimedLog.deployerShare;
        const protocolShare = feesClaimedLog.feeRecipientShare;

        totalDeployerFees += deployerShare;
        totalProtocolFees += protocolShare;
    }

    // Get RewardAdded events from staking contract - this is what actually went to holders
    const rewardAddedLogs = await options.getLogs({
        target: STAKING_CONTRACT_ADDRESS,
        eventAbi: RewardAddedEvent,
    });

    for (const rewardLog of rewardAddedLogs) {
        // Check if rewards were sent from liquidlaunch address
        if (rewardLog.from.toLowerCase() === LIQUIDLAUNCH_ADDRESS.toLowerCase()) {
            // This is what actually got distributed to holders
            dailyHoldersRevenue.add(HYPE_ADDRESS, rewardLog.amount);
            holdersRevenueAmount += rewardLog.amount;
        }
    }

    // Add deployer fees to supply side revenue
    if (totalDeployerFees > 0n) {
        dailySupplySideRevenue.add(HYPE_ADDRESS, totalDeployerFees);
    }

    // Protocol revenue should ideally be 0 (all protocol fees should go to stakers)
    // Any difference represents timing lag or undistributed fees
    const protocolRevenueAmount = totalProtocolFees - holdersRevenueAmount;
    if (protocolRevenueAmount > 0n) {
        dailyProtocolRevenue.add(HYPE_ADDRESS, protocolRevenueAmount);
    }

    // Calculate total revenue (protocol + holders)
    const totalRevenueAmount = protocolRevenueAmount + holdersRevenueAmount;
    if (totalRevenueAmount > 0n) {
        dailyRevenue.add(HYPE_ADDRESS, totalRevenueAmount);
    }

    return {
        dailyVolume,
        dailyFees,
        dailyHoldersRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: "2025-01-01",
        },
    },
                methodology: {
                    Volume: "Volume is calculated from hypeIn amounts in TokensPurchased events and hypeOut amounts in TokensSold events.",
                    Fees: "Fees include: (1) Pre-bond trading fees: 1% of HYPE from TokensPurchased/TokensSold events, (2) Bond fees: 20 HYPE when tokens bond to DEX, (3) Post-bond LP fees: claimed via FeesClaimed events.",
                    Revenue: "Revenue to the protocol ecosystem (ProtocolRevenue + HoldersRevenue), excluding deployer fees.",
                    ProtocolRevenue: "Should ideally be 0 as all protocol fees go to LIQD stakers.",
                    HoldersRevenue: "Revenue distributed to LIQD stakers via RewardAdded events from the staking contract. This should include all protocol fees (pre-bond 1% fees + 75% of bond fees + 50% of LP fees).",
                    SupplySideRevenue: "Revenue that goes to token deployers: 25% of bond fees (5 HYPE per bond) + 50% of post-bond LP fees from FeesClaimed events.",
                },
};

export default adapter; 