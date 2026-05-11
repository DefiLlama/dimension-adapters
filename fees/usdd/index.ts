import sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const WAD = 10n ** 18n;
const RAY = 10n ** 27n;

const ABI = {
  fold: "event Fold(bytes32 i, address u, int256 rate)",
  sellGem: "event SellGem(address indexed owner, uint256 value, uint256 fee)",
  buyGem: "event BuyGem(address indexed owner, uint256 value, uint256 fee)",
  bark: "event Bark(bytes32 indexed ilk, address indexed urn, uint256 ink, uint256 art, uint256 due, address clip, uint256 indexed id)",
  vatIlks: "function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)",
  dogIlks: "function ilks(bytes32) view returns (address clip, uint256 chop, uint256 hole, uint256 dirt)",
};


const chainConfig: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    usdd: "0x4f8e5de400de08b164e7421b3ee387f461becd1a",
    vat: "0xff77f6209239deb2c076179499f2346b0032097f",
    dog: "0x9681604090395e835ff54187f638ded8dc983cbf",
    psms: [
      "0xce355440c00014a229bbec030a2b8f8eb45a2897",
      "0x12d0351f68035a41d13fc8324562e2d51b7a3b93",
    ],
    start: "2025-09-02",
  },
  [CHAIN.BSC]: {
    usdd: "0x45e51bc23d592eb2dba86da3985299f7895d66ba",
    vat: "0x41f1402ab4d900115d1f16a14a3cf4bdf2f2705c",
    dog: "0x6badab4336b17e8d0839fd0c046e21b41196280b",
    psms: ["0x939d3fb56cd12d68caa1125cc57a8d2391f7ee29"],
    start: "2025-10-08",
  },
  [CHAIN.TRON]: {
    start: "2025-05-10",
  },
};

const TRON_COLLATERALS_API = "https://app-api.usdd.io/vault/collaterals";
const TRON_HISTORY_API = "https://app-api.usdd.io/data-platform/collateral-history?interval=ANNUAL&chain=tron";

const toWad = (rad: bigint) => rad / RAY;
const blockOf = ({ blockNumber, block, block_number }: any) => Number(blockNumber ?? block ?? block_number);

const tronRate = (markets: any[]) => {
  let debt = 0;
  let fees = 0;

  markets.forEach(({ curMinted, stabilityFee }) => {
    const minted = Number(curMinted ?? 0);
    debt += minted;
    fees += minted * Number(stabilityFee ?? 0);
  });

  return debt ? fees / debt : 0;
};

const tronDebt = (items: any[], timestamp: number) => {
  const day = new Date(timestamp * 1000).toISOString().slice(0, 10);
  return Number(items.find((item) => item.time?.startsWith(day))?.debt ?? 0);
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  if (options.chain === CHAIN.TRON) {
    const [collaterals, history] = await Promise.all([
      httpGet(TRON_COLLATERALS_API),
      httpGet(TRON_HISTORY_API),
    ]);
    
    const YEAR = 365 * 24 * 3600;
    const timeframe = options.toTimestamp - options.fromTimestamp;
    const fee = tronDebt(history.data?.items ?? [], options.fromTimestamp) * tronRate(collaterals.data?.items ?? []) * timeframe / YEAR;

    dailyFees.addUSDValue(fee, METRIC.BORROW_INTEREST);

    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  }

  const config = chainConfig[options.chain] as any;

  const [folds, sells, buys, barks] = await Promise.all([
    options.getLogs({ target: config.vat, eventAbi: ABI.fold }),
    options.getLogs({ targets: config.psms, eventAbi: ABI.sellGem, flatten: true }),
    options.getLogs({ targets: config.psms, eventAbi: ABI.buyGem, flatten: true }),
    options.getLogs({ target: config.dog, eventAbi: ABI.bark }),
  ]);

  for (const log of folds) {
    const rateDelta = BigInt(log.rate ?? 0);
    if (rateDelta <= 0n) continue;

    const api = new sdk.ChainApi({ chain: options.chain, block: blockOf(log) });
    const [art] = await api.call({ target: config.vat, abi: ABI.vatIlks, params: [log.i] });
    const fee = toWad(BigInt(art) * rateDelta);

    dailyFees.add(config.usdd, fee, METRIC.BORROW_INTEREST);
  }

  for (const log of [...sells, ...buys]) {
    const fee = BigInt(log.fee ?? 0);
    if (!fee) continue;

    dailyFees.add(config.usdd, fee, METRIC.MINT_REDEEM_FEES);
  }

  for (const log of barks) {
    const api = new sdk.ChainApi({ chain: options.chain, block: blockOf(log) });
    const [, chop] = await api.call({ target: config.dog, abi: ABI.dogIlks, params: [log.ilk] });
    const penalty = BigInt(chop) > WAD ? toWad(BigInt(log.due ?? 0) * (BigInt(chop) - WAD) / WAD) : 0n;
    if (!penalty) continue;

    dailyFees.add(config.usdd, penalty, METRIC.LIQUIDATION_FEES);
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "Stability fees, PSM fees, and liquidation penalties. Smart Allocator yield is excluded because the public API is a current snapshot, not date-based historical data.",
  Revenue: "All counted fees accrue to protocol surplus in Vow.",
  ProtocolRevenue: "All counted fees accrue to protocol surplus in Vow.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Stability fees charged on USDD vault debt.",
    [METRIC.MINT_REDEEM_FEES]: "Fees emitted by USDD PSM SellGem and BuyGem events.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation penalty target from Dog liquidations.",
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "Stability fees accrued to Vow surplus.",
    [METRIC.MINT_REDEEM_FEES]: "PSM fees accrued to Vow surplus.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation penalties accrued to protocol surplus.",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: "Stability fees accrued to Vow surplus.",
    [METRIC.MINT_REDEEM_FEES]: "PSM fees accrued to Vow surplus.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation penalties accrued to protocol surplus.",
  },
};



const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: chainConfig,
};

export default adapter;
