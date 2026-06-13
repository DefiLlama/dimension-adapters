import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const TRADING_CONTRACT = "0xf3393dC9E747225FcA0d61BfE588ba2838AFb077";
const PACKSHOP_CONTRACT = "0xd303fccf599648f89ccfa483f10da4a92e3dabd5";

const TRADE_EVENT_ABI =
    "event Trade(address indexed trader, uint256 indexed playerId, bool isBuy, uint256 amountInUnits, uint256 priceInWei, uint256 feeInWei, uint256 newSupplyInUnits, bool isIPOWindow)";

const REFERRAL_FEE_PAID_ABI =
    "event ReferralFeePaid(address indexed referrer, address indexed user, uint256 amountInWei)";

const ETH_PRIZE_DEPOSITED_ABI =
    "event EthPrizeDeposited(uint256 amountInWei)";

// Thirdweb DropERC1155 pack shop. TokensClaimed carries quantity but not
// price — we look up pricePerToken via getClaimConditionById for each
// unique (tokenId, claimConditionIndex) pair seen in the day's logs.
const TOKENS_CLAIMED_ABI =
    "event TokensClaimed(uint256 indexed claimConditionIndex, address indexed claimer, address indexed receiver, uint256 tokenId, uint256 quantityClaimed)";

const GET_CLAIM_CONDITION_ABI =
    "function getClaimConditionById(uint256 _tokenId, uint256 _conditionId) view returns ((uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata) condition)";

const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

// Trade.feeInWei carries the total user-paid fee on every fee-generating path
// (IPO buy + all sells). UserSharesChanged.totalFeesInWei is emitted 1:1 with
// each Trade and carries the same value, so summing Trade.feeInWei captures
// all fees without double-counting.
//
// Fee flow:
//   fees = prizePool + protocolTreasury + referrer(optional)
// Events used for the split:
//   EthPrizeDeposited   -> prize pool inflow (holders revenue)
//   ReferralFeePaid     -> actual referrer payouts (supply-side revenue)
//     (if referrer transfer fails the amount is redirected to protocol and
//      ReferralFeeRedirectedToProtocol is emitted instead — correctly
//      excluded from supplySideRevenue)
//   Protocol treasury   -> fees - prize - referral
//
// Pack shop primary mints have no holder/referral split: the full sale value
// flows to the primary sale recipient (protocol treasury), so we book pack
// sales under dailyFees with the 'Pack Sales' label and they fall through to
// dailyRevenue via the existing fees − supplySide derivation.

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [tradeLogs, referralLogs, prizeLogs, claimLogs] = await Promise.all([
        options.getLogs({ target: TRADING_CONTRACT, eventAbi: TRADE_EVENT_ABI }),
        options.getLogs({ target: TRADING_CONTRACT, eventAbi: REFERRAL_FEE_PAID_ABI }),
        options.getLogs({ target: TRADING_CONTRACT, eventAbi: ETH_PRIZE_DEPOSITED_ABI }),
        options.getLogs({ target: PACKSHOP_CONTRACT, eventAbi: TOKENS_CLAIMED_ABI }),
    ]);

    for (const log of tradeLogs) {
        // Buy:  priceInWei is gross (includes IPO fees when active)
        // Sell: priceInWei is net; gross = priceInWei + feeInWei
        const fee = log.feeInWei;
        const grossVolume = log.isBuy ? log.priceInWei : log.priceInWei + fee;
        dailyVolume.addGasToken(grossVolume);
        dailyFees.addGasToken(fee, METRIC.TRADING_FEES);
    }

    for (const log of referralLogs) {
        dailySupplySideRevenue.addGasToken(log.amountInWei, 'Referral Rewards');
    }

    for (const log of prizeLogs) {
        dailySupplySideRevenue.addGasToken(log.amountInWei, 'Prize Pool Rewards');
    }

    if (claimLogs.length > 0) {
        // Dedupe (tokenId, conditionIndex) pairs before resolving prices — many
        // claims share the same active condition during a single window.
        const pairKey = (tokenId: any, conditionId: any) =>
            `${tokenId.toString()}-${conditionId.toString()}`;
        const uniquePairs = new Map<string, { tokenId: any; conditionId: any }>();
        for (const log of claimLogs) {
            const key = pairKey(log.tokenId, log.claimConditionIndex);
            if (!uniquePairs.has(key)) {
                uniquePairs.set(key, {
                    tokenId: log.tokenId,
                    conditionId: log.claimConditionIndex,
                });
            }
        }
        const pairs = [...uniquePairs.values()];
        const conditions = await options.api.multiCall({
            target: PACKSHOP_CONTRACT,
            abi: GET_CLAIM_CONDITION_ABI,
            calls: pairs.map((p) => ({ params: [p.tokenId, p.conditionId] })),
            permitFailure: true,
        });

        const priceByPair = new Map<string, { price: bigint; currency: string }>();
        pairs.forEach((p, i) => {
            const c = conditions[i];
            if (!c) return;
            priceByPair.set(pairKey(p.tokenId, p.conditionId), {
                price: BigInt(c.pricePerToken),
                currency: String(c.currency).toLowerCase(),
            });
        });

        for (const log of claimLogs) {
            const cond = priceByPair.get(pairKey(log.tokenId, log.claimConditionIndex));
            if (!cond) continue;
            if(cond.currency === NATIVE_ETH) cond.currency = NULL_ADDRESS;
            const paid = cond.price * BigInt(log.quantityClaimed);
            if (paid === 0n) continue;
            dailyVolume.add(cond.currency, paid);
            dailyFees.add(cond.currency, paid, 'Pack Sales');
        }
    }

    const revenue = await dailyFees.getUSDValue() - await dailySupplySideRevenue.getUSDValue();
    dailyRevenue.addUSDValue(revenue, METRIC.PROTOCOL_FEES);

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Volume: "Gross ETH traded on share buys/sells plus pack shop primary mint sales",
    Fees: "Trading fees on buy/sell plus the full value of pack shop primary mints (no holder split on packs)",
    UserFees: "Total ETH paid by users — trading fees plus pack shop purchase prices",
    Revenue: "Part of fees retained by the protocol (trading fees minus prize/referral payouts, plus 100% of pack sales)",
    ProtocolRevenue: "All the revenue goes to the protocol",
    SupplySideRevenue: "Includes referral rewards and prize pool rewards (trading only — packs do not split)",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users",
        'Pack Sales': "Pack shop primary mints — full sale value accrues to the protocol",
    },
    UserFees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users",
        'Pack Sales': "Pack shop primary mints — full sale value accrues to the protocol",
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "Part of fees retained by the protocol",
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "All the revenue goes to the protocol",
    },
    SupplySideRevenue: {
        'Referral Rewards': "Referral rewards paid to referrers",
        'Prize Pool Rewards': "Prize pool rewards paid to users holding fractional shares of football players",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.MEGAETH],
    start: "2026-01-11",
    methodology,
    breakdownMethodology,
    allowNegativeValue: true, //when prize pool + referral rewards exceed fees
};

export default adapter;
