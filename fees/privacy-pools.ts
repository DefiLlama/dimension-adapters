import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const BPS = 10_000n;

const METRICS = {
  DEPOSIT_FEES: "Deposit Vetting Fees",
  RELAYER_FEES: "Relayer Fees",
}

const abis = {
  deposited: "event Deposited(address indexed depositor, address indexed pool, uint256 commitment, uint256 amount)",
  withdrawalRelayed: "event WithdrawalRelayed(address indexed relayer, address indexed recipient, address indexed asset, uint256 amount, uint256 feeAmount)",
  asset: "function ASSET() view returns (address)",
  assetConfig: "function assetConfig(address asset) view returns (address pool, uint256 minimumDepositAmount, uint256 vettingFeeBPS, uint256 maxRelayFeeBPS)",
}

const token = (asset: string) => asset.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ? ADDRESSES.null : asset;

const chainConfig: Record<string, { entrypoint: string, start: string }> = {
  [CHAIN.ETHEREUM]: {
    entrypoint: "0x6818809eefce719e480a7526d76bd3e561526b46",
    start: "2025-03-30",
  },
  [CHAIN.ARBITRUM]: {
    entrypoint: "0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E",
    start: "2025-11-27",
  },
  [CHAIN.OPTIMISM]: {
    entrypoint: "0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E",
    start: "2025-11-27",
  },
}

const fetch = async (options: FetchOptions) => {
  const { entrypoint } = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const deposits = await options.getLogs({ target: entrypoint, eventAbi: abis.deposited });
  if (deposits.length) {
    const pools = [...new Set(deposits.map(log => log.pool.toLowerCase()))];
    const assets: string[] = await options.api.multiCall({ abi: abis.asset, calls: pools });
    const configs = await options.api.multiCall({
      target: entrypoint,
      abi: abis.assetConfig,
      calls: [...new Set(assets.map(asset => asset.toLowerCase()))],
    });

    const poolToAsset = Object.fromEntries(pools.map((pool, i) => [pool, assets[i]]));
    const poolToFeeBps = Object.fromEntries(configs.map((config: any) => [
      String(config.pool ?? config[0]).toLowerCase(),
      BigInt(config.vettingFeeBPS ?? config[2]),
    ]));

    deposits.forEach(log => {
      const pool = log.pool.toLowerCase();
      const feeBps = poolToFeeBps[pool];
      if (!feeBps) return;

      const fee = BigInt(log.amount) * feeBps / (BPS - feeBps);
      dailyFees.add(token(poolToAsset[pool]), fee, METRICS.DEPOSIT_FEES);
      dailyRevenue.add(token(poolToAsset[pool]), fee, METRICS.DEPOSIT_FEES);
    });
  }

  const relays = await options.getLogs({ target: entrypoint, eventAbi: abis.withdrawalRelayed });
  relays.forEach(log => {
    dailyFees.add(token(log.asset), log.feeAmount, METRICS.RELAYER_FEES);
    dailySupplySideRevenue.add(token(log.asset), log.feeAmount,METRICS.RELAYER_FEES);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Deposit vetting fees retained by protocol plus relayer fees paid on withdrawals.",
  Revenue: "Deposit vetting fees retained by the protocol.",
  ProtocolRevenue: "Deposit vetting fees retained by the protocol.",
  SupplySideRevenue: "Relayer fees paid to withdrawal relayers.",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRICS.DEPOSIT_FEES]: "Deposit fee deducted by the Entrypoint before funds are forwarded to the Privacy Pool.",
      [METRICS.RELAYER_FEES]: "Fee paid to relayers when users withdraw through the Entrypoint relay.",
    },
    Revenue: {
      [METRICS.DEPOSIT_FEES]: "Deposit vetting fees retained by the Entrypoint and withdrawable by the protocol owner.",
    },
    ProtocolRevenue: {
      [METRICS.DEPOSIT_FEES]: "Deposit vetting fees retained by the Entrypoint and withdrawable by the protocol owner.",
    },
    SupplySideRevenue: {
      [METRICS.RELAYER_FEES]: "Relayer fees paid to third-party relayers for processing private withdrawals.",
    },
  },
};

export default adapter;
