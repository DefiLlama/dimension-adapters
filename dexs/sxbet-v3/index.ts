import { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

const FEE_TO_PROTOCOL = "Trading Commission To Protocol";

const OBV3_ESCROW = "0x890482680C3a0116aBB003B17e7D694D13a6c1eB";
const USDC = ADDRESSES.sxr.USDC;
const FEE_RECIPIENTS = [
    "0xe78f74d91678de26059a5cad4ce940e476688d83", // 2026-08-25 to 2026-09-04 15:07 UTC
    "0x9f9cce0b66b12eb04ea820c6cdf75a4390aaac6a", // from 2026-09-04 15:45 UTC; also holds the SX community fund
];

// One event per side of every fill: topics = [sig, account, orderHash, fillId],
// data = [stake (USDC), ?, tradeId]. The stakes of all sides of a trade add up to its totalReturn.
// Read by topic: the escrow implementation (0xc80a671c388336bC32fB1d802ec948F8cd8b3A09) is unverified
// and the signature is in no public signature database, so there is no eventAbi to decode it with.
const FILL_TOPIC = "0x8c0f51139d040da3430c11b90599385e98d15074f855b6492a26e4fd5b4e105b";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const pad = (addr: string) => "0x" + addr.toLowerCase().replace("0x", "").padStart(64, "0");

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const fills = await options.getLogs({ target: OBV3_ESCROW, topics: [FILL_TOPIC], entireLog: true });
    fills.forEach((log: any) => dailyVolume.addUSDValue(Number(BigInt(log.data.slice(0, 66))) / 1e6));

    const feeFilter = { extraTopics: [pad(OBV3_ESCROW), FEE_RECIPIENTS.map(pad)] };
    const feeTransfers = await options.getLogs({ target: USDC, eventAbi: TRANSFER_EVENT, ...feeFilter });
    feeTransfers.forEach((log: any) => {
        const usd = Number(log.value) / 1e6;
        dailyFees.addUSDValue(usd, METRIC.TRADING_FEES);
        dailyRevenue.addUSDValue(usd, FEE_TO_PROTOCOL);
    });

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue.clone(),
        dailySupplySideRevenue: 0,
    };
}

const methodology = {
    Volume: "Total stake matched each day, read from the SX Bet V3 escrow's fill events. Every bet is funded by both sides, so both stakes are counted.",
    Fees: "Commission SX Bet takes on the profit of winning bets, counted when the escrow pays it to SX's fee wallet at settlement. On V3 the rates are set per account and can apply to singles as well as parlays; losing and voided bets pay nothing.",
    Revenue: "Commission taken from the profit of winning bets and kept by SX. Market makers get none of it.",
    ProtocolRevenue: "All commission goes to SX: first a fee wallet, and from 4 September 2026 the treasury contract that also holds the SX community fund.",
    SupplySideRevenue: "Zero. Market makers get no share of the commission.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "Commission taken from the profit of winning bets when the V3 escrow pays SX's fee wallet at settlement.",
    },
    Revenue: {
        [FEE_TO_PROTOCOL]: "Commission taken from the profit of winning bets and kept by SX. Market makers get none of it.",
    },
    ProtocolRevenue: {
        [FEE_TO_PROTOCOL]: "All commission sent to SX: a fee wallet until 4 September 2026, then the treasury contract that also holds the SX community fund.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.SXR],
    start: '2026-08-27',
    methodology,
    breakdownMethodology,
    pullHourly: true,
};

export default adapter;