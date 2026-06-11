import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import fetchURL from "../../utils/fetchURL";

const VOLUME_ENDPOINT = "https://zinc.cash/api/volume/daily";
const CONFIG_ENDPOINT = "https://zinc.cash/api/config";

const BPS_DENOMINATOR = 10_000n;
const BURN_SPLIT_BPS = 9_000;
const STAKING_SPLIT_BPS = 1_000;

type DailyVolume = {
  day: string;
  gross_lamports: number | string;
};

type VolumeResponse = {
  daily: DailyVolume[];
};

type ConfigResponse = {
  deploy_total_fee_bps: number;
  deploy_admin_fee_bps?: number;
  deploy_stockpile_fee_bps?: number;
  deploy_bonanza_fee_bps?: number;
  deploy_affiliate_fee_bps?: number;
};

function toBigIntLamports(value: number | string) {
  return BigInt(Math.trunc(Number(value)));
}

function bpsAmount(amount: bigint, bps: number) {
  return ((amount * BigInt(Math.max(bps, 0))) / BPS_DENOMINATOR).toString();
}

function addIfPositive(
  balances: ReturnType<FetchOptions["createBalances"]>,
  amount: string,
  label: string,
) {
  if (BigInt(amount) > 0n) balances.add(ADDRESSES.solana.SOL, amount, label);
}

const fetch = async (options: FetchOptions) => {
  const [volume, config]: [VolumeResponse, ConfigResponse] = await Promise.all([
    fetchURL(VOLUME_ENDPOINT),
    fetchURL(CONFIG_ENDPOINT),
  ]);

  const dailyVolume = volume.daily.find(({ day }) => day === options.dateString);
  if (!dailyVolume) throw new Error(`No Zinc volume data found for ${options.dateString}`);
  const grossLamports = toBigIntLamports(dailyVolume.gross_lamports);

  const protocolBps = config.deploy_admin_fee_bps ?? 0;
  const stockpileBps = config.deploy_stockpile_fee_bps ?? 0;
  const bonanzaBps = config.deploy_bonanza_fee_bps ?? 0;
  const affiliateBps = config.deploy_affiliate_fee_bps ?? 0;
  const prizePoolBps = stockpileBps + bonanzaBps;
  const holdersBps =
    config.deploy_total_fee_bps - protocolBps - prizePoolBps - affiliateBps;

  const totalFees = bpsAmount(grossLamports, config.deploy_total_fee_bps);
  const protocolFees = bpsAmount(grossLamports, protocolBps);
  const prizePoolFees = bpsAmount(grossLamports, prizePoolBps);
  const affiliateFees = bpsAmount(grossLamports, affiliateBps);
  const holdersFees = bpsAmount(grossLamports, holdersBps);
  const burnFees = bpsAmount(BigInt(holdersFees), BURN_SPLIT_BPS);
  const stakingFees = bpsAmount(BigInt(holdersFees), STAKING_SPLIT_BPS);

  const dailyFees = options.createBalances();
  addIfPositive(dailyFees, protocolFees, "Mining Fees to Protocol");
  addIfPositive(dailyFees, holdersFees, "Mining Fees to Buybacks");
  addIfPositive(dailyFees, prizePoolFees, "Mining Fees to Prize Pools");
  addIfPositive(dailyFees, affiliateFees, "Mining Fees to Affiliates");

  const dailyUserFees = options.createBalances();
  addIfPositive(dailyUserFees, totalFees, "Mining Fees");

  const dailyProtocolRevenue = options.createBalances();
  addIfPositive(dailyProtocolRevenue, protocolFees, "Mining Fees to Protocol");

  const dailyHoldersRevenue = options.createBalances();
  addIfPositive(dailyHoldersRevenue, burnFees, "Mining Fees to $ZINC Burn");
  addIfPositive(dailyHoldersRevenue, stakingFees, "Mining Fees to $ZINC Stakers");

  const dailySupplySideRevenue = options.createBalances();
  addIfPositive(dailySupplySideRevenue, prizePoolFees, "Mining Fees to Prize Pools");

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue, "Mining Fees to Protocol");
  dailyRevenue.addBalances(dailyHoldersRevenue, "Mining Fees to $ZINC Holders");

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Total deploy fees paid by players when participating in ZINC mining rounds. Gross round volume is pulled from zinc.cash/api/volume/daily and multiplied by deploy_total_fee_bps from zinc.cash/api/config.",
  UserFees:
    "Total deploy fees paid by players when participating in ZINC mining rounds.",
  Revenue:
    "Protocol admin fees plus buyback fees that accrue to ZINC holders through burns and staking distributions.",
  ProtocolRevenue:
    "The admin portion of deploy fees retained by the ZINC treasury, using deploy_admin_fee_bps from zinc.cash/api/config.",
  HoldersRevenue:
    "The buyback portion of deploy fees, split 90% to ZINC burns and 10% to ZINC stakers.",
  SupplySideRevenue:
    "Deploy fees allocated to stockpile and bonanza prize pools.",
};

const breakdownMethodology = {
  Fees: {
    "Mining Fees to Protocol":
      "Admin portion of deploy fees retained by the ZINC treasury.",
    "Mining Fees to Buybacks":
      "Deploy fees allocated to ZINC buybacks, burns, and staking distributions.",
    "Mining Fees to Prize Pools":
      "Deploy fees allocated to stockpile and bonanza prize pools.",
    "Mining Fees to Affiliates":
      "Affiliate portion of deploy fees paid to referrers when applicable.",
  },
  UserFees: {
    "Mining Fees":
      "Total deploy fees paid by players when participating in ZINC mining rounds.",
  },
  Revenue: {
    "Mining Fees to Protocol": "Mining fees retained by the ZINC treasury.",
    "Mining Fees to $ZINC Holders":
      "Mining fees used for ZINC buybacks, burns, and staking distributions.",
  },
  ProtocolRevenue: {
    "Mining Fees to Protocol": "Mining fees retained by the ZINC treasury.",
  },
  HoldersRevenue: {
    "Mining Fees to $ZINC Burn":
      "Buyback fees converted to ZINC and burned (90% of buyback fees).",
    "Mining Fees to $ZINC Stakers":
      "Buyback fees converted to ZINC and distributed to stakers (10% of buyback fees).",
  },
  SupplySideRevenue: {
    "Mining Fees to Prize Pools":
      "Mining fees allocated to stockpile and bonanza prize pools.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-26",
  methodology,
  breakdownMethodology,
};

export default adapter;
