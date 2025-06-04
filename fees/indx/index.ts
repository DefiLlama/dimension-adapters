import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const feeAddress = '0xD04086A2E18f4B1BB565A703EBeC56eaee2ACCA0';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  const endBalance = await options.api.call({
    target: feeAddress,
    abi: 'uint256:0x',
    block: options.toBlock,
  });
  
  const startBalance = await options.api.call({
    target: feeAddress,
    abi: 'uint256:0x',
    block: options.fromBlock,
  });
  
  const received = Number(endBalance) - Number(startBalance);
  if (received > 0) {
    dailyFees.addGasToken(received);
  }
  
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-05-17'
    }
  }
};

export default adapter;
