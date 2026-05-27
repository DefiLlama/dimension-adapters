import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainConfig: any = {
    [CHAIN.ETHEREUM]: {
        contract: "0x0736bdc975af0675b9a045384efed91360d25479",
        eid: 30101n,
        start: "2025-08-08",
    },
    [CHAIN.BASE]: {
        contract: "0xc6868edf1d2a7a8b759856cb8afa333210dfeda6",
        eid: 30184n,
        start: "2025-08-08",
    },
    [CHAIN.ARBITRUM]: {
        contract: "0xc6868edf1d2a7a8b759856cb8afa333210dfeda6",
        eid: 30110n,
        start: "2025-08-08",
    },
    [CHAIN.OPTIMISM]: {
        contract: "0xc6868edf1d2a7a8b759856cb8afa333210dfeda6",
        eid: 30111n,
        start: "2025-08-08",
    },
    [CHAIN.PLASMA]: {
        contract: "0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8",
        eid: 30383n,
        start: "2025-09-19",
    },
    [CHAIN.BSC]: {
        contract: "0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8",
        eid: 30102n,
        start: "2025-10-07",
    },
    [CHAIN.MONAD]: {
        contract: "0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8",
        eid: 30390n,
        start: "2025-11-24",
    },
    [CHAIN.STABLE]: {
        contract: "0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8",
        eid: 30396n,
        start: "2025-12-04",
    },
    [CHAIN.MEGAETH]: {
        contract: "0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8",
        eid: 30398n,
        start: "2026-02-06",
    },
}

const FILL_EVENT = `event Fill(
  bytes32 indexed orderId,
  tuple(
    uint128 inputAmount,
    uint128 outputAmount,
    address inputToken,
    address outputToken,
    uint32 startTime,
    uint32 endTime,
    uint32 srcEid,
    uint32 dstEid,
    address offerer,
    address recipient
  ) order
)`;

const eidToChain = new Map(
    Object.entries(chainConfig).map(([chainName, config]: [string, any]) => [config.eid, chainName])
)

async function fetch(options: FetchOptions) {
    const fillLogs = await options.getLogs({
        target: chainConfig[options.chain].contract,
        eventAbi: FILL_EVENT,
    })

    const inputs = options.createBalances();
    const outputs = options.createBalances();

    fillLogs.forEach((log: any) => {
        const { inputToken, inputAmount, outputToken, outputAmount, srcEid } = log.order;
        const srcChain = eidToChain.get(srcEid);
        if (srcChain) inputs.add(`${srcChain}:${inputToken}`, inputAmount, { skipChain: true })
        outputs.add(outputToken, outputAmount)
    })

    const dailyFees = inputs.clone();
    dailyFees.subtract(outputs);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Fees is calculated as the difference between the input and output amounts.",
    Revenue: "All the fees are revenue.",
    ProtocolRevenue: "All the revenue goes to the protocol.",
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    adapter: chainConfig,
    methodology,
    allowNegativeValue: true,
}

export default adapter;