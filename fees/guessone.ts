// Copy this file to fees/guessone.ts in DefiLlama/dimension-adapters.
import type {FetchOptions, SimpleAdapter} from "../adapters/types";

// Native-MON mainnet suite, chain-143-guessone-rush-native-mon-v3.
// https://monadscan.com/address/0x6f6493e3923377f2d0ab100D4863dE713108b480
export const contracts = {
    guessOne: "0x6f6493e3923377f2d0ab100D4863dE713108b480",
    // Buyback funding and execution: https://monadscan.com/address/0x0E2980feCae65b07ECc5b59E6e6a1c727147fE94#code
    buybackVault: "0x0E2980feCae65b07ECc5b59E6e6a1c727147fE94",
    // GONE staking reward distributions: https://monadscan.com/address/0x2e67B195E5148825487B310FfaB94868B9F0587A#code
    staking: "0x2e67B195E5148825487B310FfaB94868B9F0587A",
} as const;

export const events = {
    round: "event RoundResolved(uint256 indexed roundId, uint256 endPrice, uint256 winningSlot, uint256 totalPool, uint256 totalDeployed, uint256 vaulted, uint256 winnersCount, uint256 winningRewardAmount)",
    treasury:
        "event ProtocolTreasuryAccrued(uint256 indexed roundId, uint256 amount)",
    buyback:
        "event BuybackFeeDistributed(uint256 indexed roundId, address indexed buybackVault, uint256 amount)",
    autoBet:
        "event AutoBetExecuted(uint256 indexed roundId, address indexed user, uint256 betCost, uint256 fee, uint256 rewardApplied, uint256 balanceAfter)",
    buybackExecuted:
        "event BuybackExecuted(address indexed operator, address indexed router, uint256 monAmount, uint256 goneAmount, uint256 quotedGoneAmount, uint256 minGoneOut)",
    staking:
        "event RewardFunded(address indexed funder, uint256 amount, uint256 rewardIncrement)",
} as const;

const labels = {
    treasury: "Round Fees To Treasury",
    buyback: "Round Fees To Buyback Vault",
    autoBet: "Auto-Bet Execution Fees",
    staking: "GONE Staking Rewards At Buyback Execution Price",
} as const;

type FullLog = {
    transactionHash: string;
    logIndex?: number;
    index?: number;
    args: Record<string, any>;
};

function logIndex(log: FullLog) {
    const index = Number(log.logIndex ?? log.index);
    if (!log.transactionHash || !Number.isSafeInteger(index) || index < 0)
        throw new Error(
            "GuessOne holder valuation requires transaction and log position",
        );
    return index;
}

/** Value successful vault-funded rewards using their funding transaction's executed MON/GONE rate. */
async function addHolderRevenue(
    options: FetchOptions,
    balances: ReturnType<FetchOptions["createBalances"]>,
) {
    const funding: FullLog[] = (
        await options.getLogs({
            target: contracts.staking,
            eventAbi: events.staking,
            onlyArgs: false,
        })
    ).filter(
        (log: FullLog) =>
            log.args.funder.toLowerCase() ===
            contracts.buybackVault.toLowerCase(),
    );
    if (!funding.length) return;

    const executions: FullLog[] = await options.getLogs({
        target: contracts.buybackVault,
        eventAbi: events.buybackExecuted,
        onlyArgs: false,
    });
    const byTransaction = new Map<string, FullLog[]>();
    for (const execution of executions) {
        logIndex(execution);
        const key = execution.transactionHash.toLowerCase();
        const batch = byTransaction.get(key) ?? [];
        batch.push(execution);
        byTransaction.set(key, batch);
    }
    for (const batch of byTransaction.values())
        batch.sort((a, b) => logIndex(a) - logIndex(b));

    const matched = new Set<FullLog>();
    for (const log of funding) {
        const position = logIndex(log);
        // The vault's nonReentrant executeBuyback funds staking at most once, then emits
        // BuybackExecuted. Each successful funding must precede its own execution;
        // reusing one means duplicate funding logs or incomplete source data, so fail.
        const execution = byTransaction
            .get(log.transactionHash.toLowerCase())
            ?.find((item) => logIndex(item) > position);
        if (!execution || matched.has(execution))
            throw new Error(
                "GuessOne staking funding has no unique matching buyback",
            );
        matched.add(execution);
        const funded = BigInt(log.args.amount);
        const spent = BigInt(execution.args.monAmount);
        const bought = BigInt(execution.args.goneAmount);
        if (funded <= 0n || spent <= 0n || bought <= 0n)
            throw new Error("GuessOne invalid holder valuation amounts");
        // Includes any pending rewards successfully released now, valued at this execution's rate.
        // This is an execution-price estimate (including trading costs), not a GONE oracle price.
        balances.addGasToken((funded * spent) / bought, labels.staking);
    }
}

/** Count actual MON fees retained at settlement and explicit execution subsidies. */
export async function fetch(options: FetchOptions) {
    if (options.chain !== "monad")
        throw new Error("GuessOne adapter supports Monad mainnet only");

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const rounds = await options.getLogs({
        target: contracts.guessOne,
        eventAbi: events.round,
    });
    let settledRetained = 0n;
    for (const round of rounds) {
        const deployed = BigInt(round.totalDeployed);
        const retained = BigInt(round.vaulted);
        const playerAllocation = BigInt(round.totalPool);
        if (
            deployed < 0n ||
            retained < 0n ||
            playerAllocation < 0n ||
            deployed !== retained + playerAllocation
        )
            throw new Error("GuessOne round allocation mismatch");
        // Stakes and player allocations only reconcile settlement; neither is a fee stream.
        settledRetained += retained;
    }

    let accruedRetained = 0n;
    for (const kind of ["treasury", "buyback"] as const) {
        const logs = await options.getLogs({
            target: contracts.guessOne,
            eventAbi: events[kind],
        });
        for (const log of logs) {
            // Accrual events exclude deposits, player payouts, donations and treasury withdrawals.
            const amount = BigInt(log.amount);
            dailyFees.addGasToken(amount, labels[kind]);
            dailyRevenue.addGasToken(amount, labels[kind]);
            accruedRetained += amount;
            // Buyback funds are earmarked separately for mining and staking, not the MON treasury.
            if (kind === "treasury")
                dailyProtocolRevenue.addGasToken(amount, labels[kind]);
        }
    }

    // All settlement events share a transaction; disagreement indicates incomplete source data.
    if (settledRetained !== accruedRetained)
        throw new Error("GuessOne settlement revenue mismatch");

    const autoBets = await options.getLogs({
        target: contracts.guessOne,
        eventAbi: events.autoBet,
    });
    for (const log of autoBets) {
        // Paid directly to the execution wallet as a gas subsidy; betCost is separate.
        const fee = BigInt(log.fee);
        dailyFees.addGasToken(fee, labels.autoBet);
        dailySupplySideRevenue.addGasToken(fee, labels.autoBet);
    }

    await addHolderRevenue(options, dailyHoldersRevenue);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };
}

const methodology = {
    Fees: "Actual MON fees accrued to the protocol treasury and sent to the buyback vault at round settlement, plus separately paid auto-bet gas subsidies. Excludes MON allocated back to players and does not count gross stakes as fees.",
    Revenue:
        "MON round settlement fees retained by the treasury and buyback vault; excludes auto-bet execution fees paid to the gas-subsidy wallet.",
    SupplySideRevenue:
        "User-paid auto-bet execution fees transferred to the execution wallet as gas subsidies, included in Fees but excluded from Revenue; measures the subsidy paid, not actual transaction gas expenditure.",
    ProtocolRevenue:
        "MON round fees allocated directly to the protocol treasury; excludes gas subsidies, the separate buyback budget and GONE inventory valuations.",
    HoldersRevenue:
        "Successful GONE staking rewards funded by the buyback vault, valued in MON at the matching buyback's actual execution rate (MON spent / GONE bought), then priced in USD by the SDK. Includes pending rewards only when successfully funded; excludes mining allocations, no-staker treasury diversions, other funders and later claims. Execution-price valuation includes trading costs and is not an independent GONE market price.",
};

// Settlement source: https://monadscan.com/address/0x6f6493e3923377f2d0ab100D4863dE713108b480#code
// Use emitted amounts, preserving the settlement's rounding and no-winner allocation.
const roundBreakdown = {
    [labels.treasury]:
        "Actual MON accrued to the round treasury in ProtocolTreasuryAccrued.amount.",
    [labels.buyback]:
        "Actual MON sent to the buyback vault in BuybackFeeDistributed.amount, including the remaining pot when no winning stake exists.",
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: ["monad"],
    // Deployed at block 104750524 on Sep 14; first fees at block 105030897 on Sep 15.
    // Keep the deployment date: the runner requires a full day after `start` even for hourly pulls.
    start: "2026-09-14",
    fetch,
    methodology,
    breakdownMethodology: {
        Fees: {
            ...roundBreakdown,
            [labels.autoBet]:
                "The fee field of each successful AutoBetExecuted event.",
        },
        Revenue: {
            ...roundBreakdown,
        },
        SupplySideRevenue: {
            [labels.autoBet]:
                "The fee field of each successful AutoBetExecuted event, paid to the auto-bet execution wallet as a gas subsidy.",
        },
        ProtocolRevenue: {
            [labels.treasury]: roundBreakdown[labels.treasury],
        },
        HoldersRevenue: {
            [labels.staking]:
                "RewardFunded.amount from the buyback vault multiplied by the matching BuybackExecuted.monAmount / goneAmount. Match by transaction and log order; round down to MON wei per funding event. Pending rewards use the successful funding transaction's rate.",
        },
    },
};

export default adapter;
