import { ChainApi } from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const BONDING_CURVE = "0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e";

const SWAP_ABI =
  "event Swap(address indexed sender, bool indexed isBuy, address indexed tokenAddr, uint256 amountIn, uint256 amountOut, uint256 reserveIn, uint256 reserveOut)";
const CREATION_ABI =
  "event Creation(address indexed creator, address tokenAddr, string logo, string description, string link1, string link2, string link3, uint256 createdTime)";

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyFees = createBalances();

  // pumpFee/createFee changes aren't logged on-chain, so there's no historical value to read.
  // We use a fresh *current-state* call (not the framework's block-pinned `api`) because
  // Bitkub Chain's public RPC isn't an archive node and rejects eth_call at old blocks.
  const currentApi = new ChainApi({ chain });
  const [pumpFeeBps, createFeeAmount] = await Promise.all([
    currentApi.call({ target: BONDING_CURVE, abi: "uint256:pumpFee" }),
    currentApi.call({ target: BONDING_CURVE, abi: "uint256:createFee" }),
  ]);
  const pumpFeeBigInt = BigInt(pumpFeeBps);

  if (pumpFeeBigInt > 0n) {
    const swapLogs = await getLogs({ target: BONDING_CURVE, eventAbi: SWAP_ABI });
    for (const log of swapLogs) {
      const feeAmount = (BigInt(log.amountIn) * pumpFeeBigInt) / (10000n - pumpFeeBigInt);
      const feeToken = log.isBuy ? ADDRESSES.null : log.tokenAddr;
      dailyFees.add(feeToken, feeAmount.toString(), "Launchpad trading fee");
    }
  }

  const creationLogs = await getLogs({ target: BONDING_CURVE, eventAbi: CREATION_ABI });
  if (creationLogs.length) {
    const totalCreationFees = BigInt(createFeeAmount) * BigInt(creationLogs.length);
    dailyFees.add(ADDRESSES.null, totalCreationFees.toString(), "Launchpad token-creation fee");
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "The pump fee (bps) deducted from every bonding-curve buy/sell, plus the flat token-creation fee.",
  Revenue: "The pump fee (bps) deducted from every bonding-curve buy/sell, plus the flat token-creation fee.",
  ProtocolRevenue: "The pump fee (bps) deducted from every bonding-curve buy/sell, plus the flat token-creation fee.",
};

const breakdownMethodology = {
  Fees: {
    "Launchpad trading fee": "The pump fee (bps) deducted from every bonding-curve buy/sell.",
    "Launchpad token-creation fee": "The flat token-creation fee.",
  },
  Revenue: {
    "Launchpad trading fee": "The pump fee (bps) deducted from every bonding-curve buy/sell.",
    "Launchpad token-creation fee": "The flat token-creation fee.",
  },
  ProtocolRevenue: {
    "Launchpad trading fee": "The pump fee (bps) deducted from every bonding-curve buy/sell.",
    "Launchpad token-creation fee": "The flat token-creation fee.",
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-06-17",
  chains: [CHAIN.BITKUB],
  methodology,
  breakdownMethodology,
};

export default adapter;