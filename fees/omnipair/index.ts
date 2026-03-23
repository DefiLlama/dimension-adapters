import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchOmnipairSwaps } from "../../helpers/omnipair";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const swaps = await fetchOmnipairSwaps(options);

  for (const swap of swaps) {
    // Omnipair fees in SwapEvent are denominated in the input token.
    const tokenKey = swap.tokenInMint;

    const amountIn = BigInt(swap.amountIn);
    const lpFee = BigInt(swap.lpFee);
    const protocolFee = BigInt(swap.protocolFee);
    const totalFees = lpFee + protocolFee;

    dailyVolume.add(tokenKey, amountIn.toString());
    dailyFees.add(tokenKey, totalFees.toString());
    dailyRevenue.add(tokenKey, protocolFee.toString());
    dailyProtocolRevenue.add(tokenKey, protocolFee.toString());
    dailySupplySideRevenue.add(tokenKey, lpFee.toString());
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyVolume,
  };
};

const methodology = {
  Fees: "Swap fees paid by users on Omnipair swaps, calculated as lpFee + protocolFee from on-chain SwapEvent logs.",
  Revenue: "Protocol revenue from swaps, calculated as protocolFee from on-chain SwapEvent logs.",
  ProtocolRevenue: "Protocol-owned share of swap fees, calculated as protocolFee.",
  SupplySideRevenue: "LP share of swap fees, calculated as lpFee.",
  Volume: "Swap input volume, calculated from amountIn on on-chain SwapEvent logs.",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  start: "2026-02-01",
  fetch,
  methodology,
};

export default adapter;