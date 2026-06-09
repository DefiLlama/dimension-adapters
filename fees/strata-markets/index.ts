import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type CDOConfig = {
  name: string;
  cdo: string;
  accounting: string;
  strategy: string;
  jrt: string;
  srt: string;
  start: string;
};

const CDOS: CDOConfig[] = [
  {
    name: "sUSDe",
    cdo: "0x908B3921aaE4fC17191D382BB61020f2Ee6C0e20",
    accounting: "0xa436c5Dd1Ba62c55D112C10cd10E988bb3355102",
    strategy: "0xdbf4FB6C310C1C85D0b41B5DbCA06096F2E7099F",
    jrt: "0xC58D044404d8B14e953C115E67823784dEA53d8F",
    srt: "0x3d7d6fdf07EE548B939A80edbc9B2256d0cdc003",
    start: "2025-10-10",
  },
  {
    name: "sNUSD",
    cdo: "0x7b6c960cf185fb27ECb91c174FAe065978beDd10",
    accounting: "0x5eFE7C9DA88568709E98b237D4D946aFbDA2aA52",
    strategy: "0x3CeF2c09c4fAD37E9bdD86CD9810c3042fB5DE88",
    jrt: "0xFC807058A352b61aEef6A38e2D0fC3990225E772",
    srt: "0x65a44528e8868166401eA08b549E19552af589dB",
    start: "2026-02-10",
  },
  {
    name: "mHYPER",
    cdo: "0x39C7E67b25fB14eAec8717B20664C2E35327e6cf",
    accounting: "0xAf32D44D510B82b64f13602f4A22c6A7FfF2b228",
    strategy: "0x8071500D237A8da2a2a020419d7BB5f8e2Fd184d",
    jrt: "0xEb205d26E9E605Ec82d1C0d652E00037C278714b",
    srt: "0x627EA69929212916Ec57B1b26d2E1a19F6129B53",
    start: "2026-04-12",
  },
  {
    name: "mm1USD",
    cdo: "0x613D1790d9BA381D27B4071C04380Db8ED120E5f",
    accounting: "0xE4A3A21Cf73a8F34fc7f45D7FcE99c569AbB2A4A",
    strategy: "0xeed127d3874B003D91F0Bf35Ba7DE3e9E1C18c75",
    jrt: "0xf7eB8dfec75C42D2d2247FE76Ccaedc59f821688",
    srt: "0xCcEd21d609CaC4A272d0c01a8FF4de9cEBc40d60",
    start: "2026-04-12",
  },
  {
    name: "sUSDat",
    cdo: "0xa617763cEB808f43eC9D532cbE8C65819afb846b",
    accounting: "0x180f7b3b807FA91EDb6e864802e4664D6Ee8Cf88",
    strategy: "0xce7B00D1004d9ED22E702A6a7F5bBdcE7297B090",
    jrt: "0x011e55d2b28306458e37Ca7E997C879BB25A455D",
    srt: "0xFaa9a0e1Db9E22AE3A20B2B58a68DC24D053d066",
    start: "2026-05-01",
  },
  {
    name: "PRIME",
    cdo: "0xff408b4843CDD4a33CD49EB2aBe057fE8D71C234",
    accounting: "0x0e90b8971bC0aBba696641eee85b39fD986267D7",
    strategy: "0x80187fD8e22E8951104b4Dd5E37037510CF51C9e",
    jrt: "0xF4C91F24E20EE8ed5eda905E501A1136334C2F27",
    srt: "0x35bFF778d3fc53a561486BF28e761428499232Eb",
    start: "2026-05-23",
  },
];

// events 
const ERC4626_DEPOSIT = "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)";
const ERC4626_WITHDRAW = "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)";
const FEE_ACCRUED = "event FeeAccrued(bool isJrt, uint256 amountToReserve, uint256 amountToTranche)";
const RESERVE_REDUCED = "event ReserveReduced(address token, uint256 amount)";

// ABIs 
const STRATEGY_TOTAL_ASSETS_ABI = "function totalAssets() view returns (uint256)";
const RESERVE_BPS_ABI = "function reserveBps() view returns (uint256)";
const ASSET_ABI = "function asset() view returns (address)";
const CONVERT_TO_ASSETS_ABI = "function convertToAssets(address token, uint256 amount, uint8 rounding) view returns (uint256)";

const sumLogField = (logs: any[], field: string): bigint =>
  logs.reduce<bigint>((acc, l) => acc + BigInt(l[field]), 0n);

async function processCDO(
  options: FetchOptions,
  cfg: CDOConfig,
  dailyFees: any,
  dailyRevenue: any,
  dailyProtocolRevenue: any,
  dailySupplySideRevenue: any
) {
  const { fromApi, toApi, getLogs } = options;

  const [baseAsset, navStartRaw, navEndRaw, reserveBpsRaw] = await Promise.all([
    toApi.call({ target: cfg.jrt, abi: ASSET_ABI }) as Promise<string>,
    fromApi.call({ target: cfg.strategy, abi: STRATEGY_TOTAL_ASSETS_ABI }),
    toApi.call({ target: cfg.strategy, abi: STRATEGY_TOTAL_ASSETS_ABI }),
    toApi.call({ target: cfg.accounting, abi: RESERVE_BPS_ABI }),
  ]);

  const navStart = BigInt(navStartRaw);
  const navEnd = BigInt(navEndRaw);
  const reserveBps = BigInt(reserveBpsRaw);

  const [
    jrtDeposits,
    jrtWithdraws,
    srtDeposits,
    srtWithdraws,
    feeAccrued,
    reserveReduced,
  ] = await Promise.all([
    getLogs({ target: cfg.jrt, eventAbi: ERC4626_DEPOSIT }),
    getLogs({ target: cfg.jrt, eventAbi: ERC4626_WITHDRAW }),
    getLogs({ target: cfg.srt, eventAbi: ERC4626_DEPOSIT }),
    getLogs({ target: cfg.srt, eventAbi: ERC4626_WITHDRAW }),
    getLogs({ target: cfg.accounting, eventAbi: FEE_ACCRUED }),
    getLogs({ target: cfg.cdo, eventAbi: RESERVE_REDUCED }),
  ]);

  const inflows =
    sumLogField(jrtDeposits, "assets") + sumLogField(srtDeposits, "assets");
  const outflowsToUsers =
    sumLogField(jrtWithdraws, "assets") + sumLogField(srtWithdraws, "assets");

  let reserveOut = 0n;
  for (const log of reserveReduced) {
    const token = (log.token as string).toLowerCase();
    if (token === baseAsset.toLowerCase()) {
      reserveOut += BigInt(log.amount);
    } else {
      const inBaseAssets: string = await toApi.call({
        target: cfg.strategy,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [log.token, log.amount, 0],
      });
      reserveOut += BigInt(inBaseAssets);
    }
  }

  const exitFeeToReserve = sumLogField(feeAccrued, "amountToReserve");
  const exitFeeToTranche = sumLogField(feeAccrued, "amountToTranche");
  const exitFeesTotal = exitFeeToReserve + exitFeeToTranche;

  // we calculate this yield from the delta of strategy assets
  // if delta is negative, the losses are absorbed by the tranches
  // and so it's safe to set yield to 0. this doesn't mean the losses 
  // of the strtegy are ignored. they are compensated by tranches & reserves
  // and so the protocol yield doesn't get negative even if the strategy performs badly
  let yieldAmount = navEnd - navStart - inflows + outflowsToUsers + reserveOut;
  if (yieldAmount < 0n) yieldAmount = 0n;

  const ONE = 10n ** 18n;
  const protocolFromYield = (yieldAmount * reserveBps) / ONE;
  const supplyFromYield = yieldAmount - protocolFromYield;

  dailyFees.add(baseAsset, yieldAmount.toString());
  dailyFees.add(baseAsset, exitFeesTotal.toString());

  dailyRevenue.add(baseAsset, protocolFromYield.toString());
  dailyRevenue.add(baseAsset, exitFeeToReserve.toString());

  dailyProtocolRevenue.add(baseAsset, protocolFromYield.toString());
  dailyProtocolRevenue.add(baseAsset, exitFeeToReserve.toString());

  dailySupplySideRevenue.add(baseAsset, supplyFromYield.toString());
  dailySupplySideRevenue.add(baseAsset, exitFeeToTranche.toString());
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const active = CDOS.filter(
    (c) =>
      new Date(c.start + "T00:00:00Z").getTime() / 1000 <= options.startTimestamp
  );

  await Promise.all(
    active.map(async (cfg) => {
      await processCDO(
        options,
        cfg,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue
      );
    })
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Includes yield generated on deposited assets and redemption fees charged by Strata.",
  Revenue: "Protocol revenue consists of performance fees (5-10%) charged by Strata on the yield generated and redemption fees paid by the users.",
  ProtocolRevenue: "Protocol revenue consists of performance and redemption fees collected by Strata, including the portion of fees shared with reserve.",
  SupplySideRevenue: "Net yield distributed to tranches (after performance fees) plus the portion of redemption fees that remain in the tranche.",
};

const earliestStart = CDOS.reduce(
  (min, c) => (c.start < min ? c.start : min),
  CDOS[0].start
);

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: earliestStart,
  methodology,
};

export default adapter;
