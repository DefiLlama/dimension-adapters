import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getProvider } from "@defillama/sdk";

// hoodfrens is a creator-fee fork of the audited TopStrike bonding-curve
// contract, running on Robinhood Chain (chainId 4663). This adapter mirrors
// the sibling `dexs/topstrike/index.ts` and adds one supply-side line the
// upstream contract does not have: the creator fee (a configurable share of
// each sell; 3.4% at launch, adjustable by the owner via setCreatorFee).
const TRADING_CONTRACT = "0xA50AdeC47FcCBDe24B0214A831d3BDde4A1E0106";

// Pack shop — Thirdweb DropERC1155 (Edition Drop) on Robinhood Chain. Its
// TokensClaimed event matches the ABI below (checked against the
// Blockscout-verified implementation ABI, 2026-07-25; claims are priced in
// native ETH). getLogs returns nothing on days without a claim, so the
// pack-sales path is a no-op until packs actually sell.
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

// Thirdweb DropERC1155 pack shop. TokensClaimed carries quantity but not the
// price paid — claims are valued from the claim transaction's tx.value rather
// than a getClaimConditionById lookup. The contract's native-currency claim
// path requires msg.value == pricePerToken * quantityClaimed, so for a direct
// claim tx the value IS the sale amount — and, unlike contract state at a
// historical block, transactions are never pruned. The previous
// getClaimConditionById approach ran an eth_call pinned to the day's block,
// and the public Robinhood RPC prunes state to a ~100-minute horizon
// ("metadata is not found"), which made every historical run (backfill /
// refill) of a pack-sale day fail permanently. Live runs were unaffected,
// which is how the fees dimension stayed complete while dexs lost days.
//
// PRECONDITION: claim conditions are priced in NATIVE ETH (true for every
// condition to date). tx.value cannot see an ERC20 payment, so a zero-value
// claim is ambiguous: genuinely free (allowlisted distributions are real and
// common), or priced in a token. The zero-value path below disambiguates via
// the tx RECEIPT (also never pruned): an ERC20-priced claim must move a token
// in the claim tx, a free claim moves none — and it fails loudly on the
// former rather than silently scoring it as zero.
const TOKENS_CLAIMED_ABI =
    "event TokensClaimed(uint256 indexed claimConditionIndex, address indexed claimer, address indexed receiver, uint256 tokenId, uint256 quantityClaimed)";

// keccak256("Transfer(address,address,uint256)") — ERC20 Transfer has 3 topics
// (ERC721's shares topic0 but has 4; the claim's own ERC1155 TransferSingle
// has a different topic0 entirely).
const ERC20_TRANSFER_TOPIC =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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

    // Sequential on purpose: the public Robinhood RPC rate-limits bursts
    // (parallel getLogs from CI runners intermittently 429s).
    const tradeLogs = await options.getLogs({ target: TRADING_CONTRACT, eventAbi: TRADE_EVENT_ABI });
    const referralLogs = await options.getLogs({ target: TRADING_CONTRACT, eventAbi: REFERRAL_FEE_PAID_ABI });
    const prizeLogs = await options.getLogs({ target: TRADING_CONTRACT, eventAbi: ETH_PRIZE_DEPOSITED_ABI });
    const creatorPaidLogs = await options.getLogs({ target: TRADING_CONTRACT, eventAbi: CREATOR_FEE_PAID_ABI });
    const creatorAccruedLogs = await options.getLogs({ target: TRADING_CONTRACT, eventAbi: CREATOR_FEE_ACCRUED_ABI });

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
            entireLog: true,
        });

        if (claimLogs.length > 0) {
            // A tx can batch several claims (multicall), and its value covers
            // all of them — count each transaction's value exactly once.
            // Raw provider rather than FetchOptions on purpose: FetchOptions
            // has no transaction surface, and helpers/getTxReceipts' fixed
            // concurrency-20 pool trips this RPC's burst limiting on heavy
            // pack days (336 claim txs on 2026-07-28). Sequential with
            // backoff, like the sequential getLogs calls above.
            const txHashes: string[] = [...new Set<string>(claimLogs.map((l: any) => String(l.transactionHash).toLowerCase()))];
            const provider = getProvider(CHAIN.ROBINHOOD);
            // Retry budget for per-tx lookups on the public Robinhood RPC.
            // The RPC rate-limits bursts but recovers within about a second;
            // there is no published rate-limit policy to cite, so the budget
            // is empirical: sequential fetches with this backoff completed
            // 711/711 claim txs (incl. the 336-tx day) without exhausting a
            // single retry budget, while helpers/getTxReceipts' concurrency-20
            // pool tripped the limiter. 4 attempts with 500ms linear backoff
            // (0, 500, 1000, 1500ms) caps a hopeless tx at ~3s before the
            // fail-loud throw below.
            const TX_FETCH_ATTEMPTS = 4;
            const TX_FETCH_BACKOFF_MS = 500;
            const withRetry = async (fn: () => Promise<any>): Promise<any> => {
                for (let attempt = 0; attempt < TX_FETCH_ATTEMPTS; attempt++) {
                    if (attempt) await new Promise((r) => setTimeout(r, TX_FETCH_BACKOFF_MS * attempt));
                    const res = await fn().catch(() => null);
                    if (res) return res;
                }
                return null;
            };
            for (const hash of txHashes) {
                const tx: any = await withRetry(() => provider.getTransaction(hash));
                // Fail loudly rather than under-report packs (same stance as
                // the previous condition-lookup version took).
                if (!tx) throw new Error(`hoodfrens: could not load pack claim tx ${hash}`);
                if (String(tx.to).toLowerCase() !== PACKSHOP_CONTRACT.toLowerCase())
                    throw new Error(`hoodfrens: pack claim routed through ${tx.to} (tx ${hash}) — tx.value is not attributable, extend the claim block`);
                const paid = BigInt(tx.value ?? 0);
                if (paid === 0n) {
                    // Free (allowlisted) claims are real distributions and
                    // correctly score zero — but an ERC20-priced condition
                    // would ALSO arrive here, and silently zeroing it is the
                    // exact failure shape this adapter version exists to fix.
                    // The receipt (never pruned) distinguishes: token payment
                    // moves an ERC20 in the claim tx, a free claim does not.
                    const receipt: any = await withRetry(() => provider.getTransactionReceipt(hash));
                    if (!receipt) throw new Error(`hoodfrens: could not load receipt for zero-value pack claim tx ${hash}`);
                    const movedErc20 = (receipt.logs ?? []).some(
                        (l: any) => l.topics?.[0] === ERC20_TRANSFER_TOPIC && l.topics.length === 3,
                    );
                    if (movedErc20)
                        throw new Error(`hoodfrens: zero-value pack claim tx ${hash} moved an ERC20 — token-priced claim condition? tx.value cannot price it, extend the claim block`);
                    continue; // genuinely free claim — no volume
                }
                // Volume only — mint proceeds are not fees (see header comment).
                dailyVolume.addGasToken(paid, 'Pack Sales');
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
