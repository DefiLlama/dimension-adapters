import sdk from "@defillama/sdk";
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
    usdd: "0x4f8E5de400De08B164E7421B3Ee387F461bEcd1a",
    vat: "0xFf77F6209239DEB2c076179499f2346b0032097f",
    dog: "0x9681604090395e835fF54187F638dED8DC983CbF",
    psms: [
      "0xCe355440c00014A229BBeC030A2b8F8EB45A2897",
      "0x12d0351F68035a41D13fC8324562e2D51B7A3B93",
    ],
    start: "2025-09-02",
  },
  [CHAIN.BSC]: {
    usdd: "0x45e51bC23d592eB2DbA86da3985299f7895D66bA",
    vat: "0x41F1402ab4d900115D1f16a14A3cF4BDF2F2705C",
    dog: "0x6BaDab4336B17e8D0839fD0c046e21B41196280B",
    psms: ["0x939d3Fb56CD12D68CAa1125Cc57A8d2391F7EE29"],
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

const fetch = async (options: any) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (options.chain === CHAIN.TRON) {
    const [collaterals, history] = await Promise.all([
      httpGet(TRON_COLLATERALS_API),
      httpGet(TRON_HISTORY_API),
    ]);
    const fee = tronDebt(history.data?.items ?? [], options.startTimestamp) * tronRate(collaterals.data?.items ?? []) / 365;

    dailyFees.addUSDValue(fee, METRIC.BORROW_INTEREST);
    dailyRevenue.addUSDValue(fee, METRIC.BORROW_INTEREST);

    dailyProtocolRevenue.addBalances(dailyRevenue);
    return { dailyFees, dailyRevenue, dailyProtocolRevenue };
  }

  const config = chainConfig[options.chain] as any;

  const [folds, sells, buys, barks] = await Promise.all([
    options.getLogs({ target: config.vat, eventAbi: ABI.fold, entireLog: true }),
    options.getLogs({ targets: config.psms, eventAbi: ABI.sellGem, flatten: true }),
    options.getLogs({ targets: config.psms, eventAbi: ABI.buyGem, flatten: true }),
    options.getLogs({ target: config.dog, eventAbi: ABI.bark, entireLog: true }),
  ]);

  for (const log of folds) {
    const rateDelta = BigInt(log.rate ?? log.args?.rate ?? 0);
    if (rateDelta <= 0n) continue;

    const api = new sdk.ChainApi({ chain: options.chain, block: blockOf(log) });
    const [art] = await api.call({ target: config.vat, abi: ABI.vatIlks, params: [log.i ?? log.args?.i] });
    const fee = toWad(BigInt(art) * rateDelta);

    dailyFees.add(config.usdd, fee, METRIC.BORROW_INTEREST);
    dailyRevenue.add(config.usdd, fee, METRIC.BORROW_INTEREST);
  }

  for (const log of [...sells, ...buys]) {
    const fee = BigInt(log.fee ?? 0);
    if (!fee) continue;

    dailyFees.add(config.usdd, fee, METRIC.MINT_REDEEM_FEES);
    dailyRevenue.add(config.usdd, fee, METRIC.MINT_REDEEM_FEES);
  }

  for (const log of barks) {
    const api = new sdk.ChainApi({ chain: options.chain, block: blockOf(log) });
    const [, chop] = await api.call({ target: config.dog, abi: ABI.dogIlks, params: [log.ilk ?? log.args?.ilk] });
    const penalty = BigInt(chop) > WAD ? toWad(BigInt(log.due ?? log.args?.due ?? 0) * (BigInt(chop) - WAD) / WAD) : 0n;
    if (!penalty) continue;

    dailyFees.add(config.usdd, penalty, METRIC.LIQUIDATION_FEES);
    dailyRevenue.add(config.usdd, penalty, METRIC.LIQUIDATION_FEES);
  }

  dailyProtocolRevenue.addBalances(dailyRevenue);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
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



const adapter = {
  version: 2,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: chainConfig,
};

export default adapter;
