import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// hoodfrens is a creator-fee fork of the audited TopStrike bonding-curve
// contract, running on Robinhood Chain (chainId 4663). This adapter mirrors
// the sibling `dexs/topstrike/index.ts` and adds one supply-side line the
// upstream contract does not have: the creator fee (a configurable share of
// each sell; 3.4% at launch, adjustable by the owner via setCreatorFee).
const TRADING_CONTRACT = "0xA50AdeC47FcCBDe24B0214A831d3BDde4A1E0106";

// Pack shop — Thirdweb DropERC1155 (Edition Drop) on Robinhood Chain. Its
// TokensClaimed event and getClaimConditionById return tuple match the ABIs
// below exactly (checked against the Blockscout-verified implementation ABI,
// 2026-07-25; sales priced in native ETH — currency is the 0xEee… sentinel the
// claim block maps to the gas token). getLogs returns nothing on days without a
// claim, so the pack-sales path is a no-op until packs actually sell.
const PACKSHOP_CONTRACT = "0x3647b90F769B473E7bCf3267D030E009705fd99D";

const TRADE_EVENT_ABI =
    "event Trade(address indexed trader, uint256 indexed playerId, bool isBuy, uint256 amountInUnits, uint256 priceInWei, uint256 feeInWei, uint256 newSupplyInUnits, bool isIPOWindow)";

const REFERRAL_FEE_PAID_ABI =
    "event ReferralFeePaid(address indexed referrer, address indexed user, uint256 amountInWei)";

const ETH_PRIZE_DEPOSITED_ABI =
    "event EthPrizeDeposited(uint256 amountInWei)";

// Creator fee (hoodfrens-only vs TopStrike). Each sell routes the creator fee
// (3.4% at launch, owner-configurable via setCreatorFee) to the card's
// creator: paid straight to a registered wallet (CreatorFeePaid) or
// accrued on-chain when no wallet is bound yet (CreatorFeeAccrued). Both fire
// exactly once per fee-generating sell, so summing the two captures every
// creator fee generated on the day's trades. CreatorFeesClaimed is
// deliberately NOT used — it only moves already-accrued fees out and would
// double-count against CreatorFeeAccrued.
const CREATOR_FEE_PAID_ABI =
    "event CreatorFeePaid(uint256 indexed playerId, address indexed wallet, uint256 amountInWei)";

const CREATOR_FEE_ACCRUED_ABI =
    "event CreatorFeeAccrued(uint256 indexed playerId, uint256 amountInWei)";

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
// (IPO buy + all sells): the contract builds it as
//   feeInWei = toPrize + toProtocol + toReferrer + toCreator
// UserSharesChanged.totalFeesInWei is emitted 1:1 with each Trade and carries
// the same value, so summing Trade.feeInWei captures all fees without
// double-counting.
//
// Fee flow (sell):
//   fees = prizePool + protocolTreasury + referrer(optional) + creator
// Events used for the supply-side split:
//   EthPrizeDeposited              -> prize pool paid out to card holders (supply-side —
//     card holders are not governance token holders, so this is NOT holders revenue)
//   ReferralFeePaid                -> actual referrer payouts (supply-side)
//     (if the referrer transfer fails the amount is redirected to protocol and
//      ReferralFeeRedirectedToProtocol is emitted instead — correctly excluded)
//   CreatorFeePaid + CreatorFeeAccrued -> creator payouts (supply-side)
//   Protocol treasury              -> fees - prize - referral - creator
// The referral fee is carved OUT of the protocol's cut (seller pays nothing
// extra), so it must not be added on top of fees — it is a redistribution of
// fees already counted, exactly like prize and creator.
//
// Pack shop primary mints are counted as VOLUME only, not fees: mint proceeds
// are sale revenue, not a fee charged on top of a trade, and the card
// inventory that backs each pack is bought on the bonding curve up-front —
// those buys already appear in Trading Volume / Trading Fees, so booking the
// full mint value as fees would overstate the protocol's take.

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [tradeLogs, referralLogs, prizeLogs, creatorPaidLogs, creatorAccruedLogs] =
        await Promise.all([
            options.getLogs({ target: TRADING_CONTRACT, eventAbi: TRADE_EVENT_ABI }),
            options.getLogs({ target: TRADING_CONTRACT, eventAbi: REFERRAL_FEE_PAID_ABI }),
            options.getLogs({ target: TRADING_CONTRACT, eventAbi: ETH_PRIZE_DEPOSITED_ABI }),
            options.getLogs({ target: TRADING_CONTRACT, eventAbi: CREATOR_FEE_PAID_ABI }),
            options.getLogs({ target: TRADING_CONTRACT, eventAbi: CREATOR_FEE_ACCRUED_ABI }),
        ]);

    for (const log of tradeLogs) {
        // Buy:  priceInWei is gross (includes IPO fees when active)
        // Sell: priceInWei is net; gross = priceInWei + feeInWei
        const fee = log.feeInWei;
        const grossVolume = log.isBuy ? log.priceInWei : log.priceInWei + fee;
        dailyVolume.addGasToken(grossVolume, 'Trading Volume');
        dailyFees.addGasToken(fee, METRIC.TRADING_FEES);
    }

    for (const log of referralLogs) {
        dailySupplySideRevenue.addGasToken(log.amountInWei, 'Referral Rewards');
    }

    // Prize pool is distributed to users holding fractional shares of creator
    // cards. Card holders are not governance token holders, so per DefiLlama
    // guidance this is supply-side revenue, not holders revenue.
    for (const log of prizeLogs) {
        dailySupplySideRevenue.addGasToken(log.amountInWei, 'Prize Pool Rewards');
    }

    for (const log of creatorPaidLogs) {
        dailySupplySideRevenue.addGasToken(log.amountInWei, METRIC.CREATOR_FEES);
    }

    for (const log of creatorAccruedLogs) {
        dailySupplySideRevenue.addGasToken(log.amountInWei, METRIC.CREATOR_FEES);
    }

    if (PACKSHOP_CONTRACT) {
        const claimLogs = await options.getLogs({
            target: PACKSHOP_CONTRACT,
            eventAbi: TOKENS_CLAIMED_ABI,
        });

        if (claimLogs.length > 0) {
            // Dedupe (tokenId, conditionIndex) pairs before resolving prices —
            // many claims share the same active condition during a window.
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
            // No permitFailure: a claim log always carries a claimConditionIndex
            // that existed at claim time, so an unresolved condition means a bad
            // read, not a real state. Fail loudly rather than under-report packs.
            const conditions = await options.api.multiCall({
                target: PACKSHOP_CONTRACT,
                abi: GET_CLAIM_CONDITION_ABI,
                calls: pairs.map((p) => ({ params: [p.tokenId, p.conditionId] })),
            });

            const priceByPair = new Map<string, { price: bigint; currency: string }>();
            pairs.forEach((p, i) => {
                const c = conditions[i];
                if (!c) throw new Error(`hoodfrens: unresolved pack claim condition (token ${p.tokenId}, index ${p.conditionId})`);
                priceByPair.set(pairKey(p.tokenId, p.conditionId), {
                    price: BigInt(c.pricePerToken),
                    currency: String(c.currency).toLowerCase(),
                });
            });

            for (const log of claimLogs) {
                const cond = priceByPair.get(pairKey(log.tokenId, log.claimConditionIndex));
                if (!cond) throw new Error(`hoodfrens: missing price for pack claim (token ${log.tokenId}, index ${log.claimConditionIndex})`);
                if (cond.currency === NATIVE_ETH) cond.currency = NULL_ADDRESS;
                const paid = cond.price * BigInt(log.quantityClaimed);
                if (paid === 0n) continue;
                // Volume only — mint proceeds are not fees (see header comment).
                dailyVolume.add(cond.currency, paid, 'Pack Sales');
            }
        }
    }

    // Revenue = the protocol treasury's retained cut: fees minus everything
    // redistributed (prize pool to card holders, referrers, creators). Revenue
    // metrics use a destination label; fee-source labels stay on dailyFees.
    const protocolCut = await dailyFees.getUSDValue() - await dailySupplySideRevenue.getUSDValue();
    dailyRevenue.addUSDValue(protocolCut, 'Protocol Revenue');
    dailyProtocolRevenue.addUSDValue(protocolCut, 'Protocol Revenue');

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Volume: "Gross ETH traded on card buys/sells plus pack shop primary mint sales",
    Fees: "Trading fees paid by users on card buys/sells (pack primary-mint proceeds are counted as volume, not fees)",
    UserFees: "Trading fees paid by users on card buys/sells",
    Revenue: "Trading fees retained by the protocol treasury — fees minus the prize-pool, referral, and creator payouts",
    ProtocolRevenue: "Same as Revenue — the protocol treasury's retained cut of trading fees",
    SupplySideRevenue: "Prize-pool rewards distributed to card holders, referral rewards, and creator rewards",
};

const breakdownMethodology = {
    Volume: {
        'Trading Volume': "Gross ETH traded on card buys/sells",
        'Pack Sales': "Pack shop primary mints — quantity × claim-condition price",
    },
    Fees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users",
    },
    UserFees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users",
    },
    Revenue: {
        'Protocol Revenue': "The protocol treasury's retained cut of trading fees",
    },
    ProtocolRevenue: {
        'Protocol Revenue': "The protocol treasury's retained cut of trading fees",
    },
    SupplySideRevenue: {
        'Prize Pool Rewards': "Prize pool distributed to users holding fractional shares of creator cards",
        'Referral Rewards': "Referral rewards paid to referrers",
        [METRIC.CREATOR_FEES]: "Creator fees paid to the card's creator — a configurable share of each sell",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ROBINHOOD],
    start: "2026-07-11", // contract deploy block 7003890
    methodology,
    breakdownMethodology,
    allowNegativeValue: true, // direct prize deposits (supply-side, no matching trade fee) can exceed the day's fees → negative revenue
};

export default adapter;
