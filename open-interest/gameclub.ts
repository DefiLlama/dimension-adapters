import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// CT_ADDRESS (Conditional Tokens) holds all user-deposited USDT for active prediction markets
const CT_ADDRESS = "0xE6D3a683bEB3fB92A4F2DB53d642Af331bfbbfb3";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();

  const balance = await options.api.call({
    abi: "function balanceOf(address) view returns (uint256)",
    target: USDT,
    params: [CT_ADDRESS],
  });

  openInterestAtEnd.add(USDT, balance);

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: "2026-04-01",
};

export default adapter;
