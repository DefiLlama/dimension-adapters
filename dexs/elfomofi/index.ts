import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";


const SwapEvent = "event ElfomoTrade(uint256 indexed quoteId, uint256 indexed partnerId, address executor, address receiver, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount)";
const VaultMetricsEvent = "event VaultMetrics(uint256 indexed vaultId, address indexed refTokenAddress, uint256 prevRate, uint256 newRate, uint256 newPreFeeRate, uint256 newHighWaterMarkRate, uint256 prevTimestamp, uint256 newTimestamp, int256 lastPeriodPreFeeAPRInBps, uint256 feeProtocolInRefToken, uint256 feeCuratorInRefToken, uint256 yieldToLPsInRefToken, uint256 protocolSharesMinted, uint256 curatorSharesMinted, uint256 totalAssetsInRefToken)";
const ELFOMOFI_SWAP_ADDRESS = "0xf0f0F0F0FB0d738452EfD03A28e8be14C76d5f73";
const ELFOMOFI_VAULTS_MANAGER = "0xE34CD3682AF9C04303386499FBa215B38Eff6106";

const DAY = 86400;
const DISTRIBUTE_DAYS = 5;
const DISTRIBUTE_SECONDS = DISTRIBUTE_DAYS * DAY;
const LOOKBACK_SECONDS = 15 * DAY;

interface ISettlement {
    t: number;
    token: string;
    feeProtocol: bigint;
    feeCurator: bigint;
    yieldLps: bigint;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();

    const swapLogs = await options.getLogs({
        target: ELFOMOFI_SWAP_ADDRESS,
        eventAbi: SwapEvent,
    })

    for (const log of swapLogs) {
        dailyVolume.add(log.fromToken, log.fromAmount);
    }

    if (options.chain !== CHAIN.BASE) {
        return { dailyVolume };
    }

    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    const { startTimestamp, endTimestamp } = options;

    // Read settlements from before the window too, so we can see the one we're mid-distribution on.
    // Only the lower bound moves back - we never read past the window end, so a stored day stays final.
    const fromBlock = await options.getFromBlock();
    const toBlock = await options.getToBlock();
    const secondsPerBlock = (options.toTimestamp - options.fromTimestamp) / (toBlock - fromBlock);
    const lookbackBlocks = Math.ceil(LOOKBACK_SECONDS / secondsPerBlock);

    const vaultLogs = await options.getLogs({
        target: ELFOMOFI_VAULTS_MANAGER,
        eventAbi: VaultMetricsEvent,
        fromBlock: Math.max(0, fromBlock - lookbackBlocks),
        toBlock,
    })

    // Each vault settles on its own schedule, so distribute it as an independent stream.
    const byVault = new Map<string, ISettlement[]>();
    for (const log of vaultLogs) {
        const t = Number(log.newTimestamp);
        if (t > endTimestamp) continue; // hasn't happened yet as far as this window is concerned
        const vaultId = String(log.vaultId);
        const stream = byVault.get(vaultId) ?? [];
        stream.push({
            t,
            token: log.refTokenAddress,
            feeProtocol: BigInt(log.feeProtocolInRefToken),
            feeCurator: BigInt(log.feeCuratorInRefToken),
            yieldLps: BigInt(log.yieldToLPsInRefToken),
        });
        byVault.set(vaultId, stream);
    }

    const addFees = (token: string, feeProtocol: bigint, feeCurator: bigint, yieldLps: bigint) => {
        if (feeProtocol === 0n && feeCurator === 0n && yieldLps === 0n) return;

        dailyFees.add(token, yieldLps, METRIC.ASSETS_YIELDS);
        dailyFees.add(token, feeProtocol, METRIC.ASSETS_YIELDS);
        dailyFees.add(token, feeCurator, METRIC.ASSETS_YIELDS);

        dailySupplySideRevenue.add(token, yieldLps, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(token, feeCurator, METRIC.CURATORS_FEES);

        dailyRevenue.add(token, feeProtocol, METRIC.PERFORMANCE_FEES);
        dailyProtocolRevenue.add(token, feeProtocol, METRIC.PERFORMANCE_FEES);
    };

    for (const stream of byVault.values()) {
        stream.sort((a, b) => a.t - b.t);

        for (let i = 0; i < stream.length; i++) {
            const s = stream[i];
            const next = stream[i + 1];

            // Drip s out at the DISTRIBUTE_SECONDS rate, but stop once the next settlement takes over.
            const distributeEnd = next ? next.t : endTimestamp;
            const overlap = Math.min(endTimestamp, distributeEnd) - Math.max(startTimestamp, s.t);
            if (overlap > 0) {
                const distribute = (amount: bigint) => amount * BigInt(overlap) / BigInt(DISTRIBUTE_SECONDS);
                addFees(s.token, distribute(s.feeProtocol), distribute(s.feeCurator), distribute(s.yieldLps));
            }

            // The moment the next settlement lands, pay out whatever of s we didn't get to
            if (next && next.t > startTimestamp && next.t <= endTimestamp) {
                const remainingSeconds = Math.max(0, DISTRIBUTE_SECONDS - (next.t - s.t));
                if (remainingSeconds > 0) {
                    const remainder = (amount: bigint) => amount * BigInt(remainingSeconds) / BigInt(DISTRIBUTE_SECONDS);
                    addFees(s.token, remainder(s.feeProtocol), remainder(s.feeCurator), remainder(s.yieldLps));
                }
            }
        }
    }

    return {
        dailyVolume,
        dailyFees,
        dailySupplySideRevenue,
        dailyRevenue,
        dailyProtocolRevenue,
    }
}

const methodology = {
    Volume: "Volume is calculated from the fromAmount of all ElfomoTrade events on the Elfomofi swap contract.",
    Fees: "Total yield generated by Elfomofi vaults. Sum of yield distributed to LPs, performance fees captured by the protocol, and performance fees directed to curators. Each settlement reports a multi-day period at once, so its fees are distributed evenly forward over the following days.",
    Revenue: "Performance fees captured by the Elfomofi protocol.",
    ProtocolRevenue: "Elfomofi protocol's share of vault performance fees.",
    SupplySideRevenue: "Yield distributed to vault LPs plus performance fees directed to vault curators. Curators are independent operators that manage vault strategies on behalf of LPs.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Gross yield generated by Elfomofi vaults.",
    },
    Revenue: {
        [METRIC.PERFORMANCE_FEES]: "Performance fees captured by the Elfomofi protocol.",
    },
    ProtocolRevenue: {
        [METRIC.PERFORMANCE_FEES]: "Performance fees captured by the Elfomofi protocol.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yield distributed to vault LPs.",
        [METRIC.CURATORS_FEES]: "Performance fees directed to vault curators.",
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    methodology,
    breakdownMethodology,
    adapter: {
      [CHAIN.BASE]: {
        fetch,
        start: "2026-01-06",
      },
      [CHAIN.BSC]: {
        fetch,
        start: "2026-03-15",
      },
    },
  };

  export default adapter;
