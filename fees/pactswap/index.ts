import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getFee, getFeeClaimsCount, getFeeSmartContract, oneDayInSeconds } from "./helpers";

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const feeSmartContract = await getFeeSmartContract();
  const formattedFeeSmartContract = feeSmartContract.startsWith('0x') ? feeSmartContract : `0x${feeSmartContract}`;

  let startTime = new Date(options.fromTimestamp * 1000).toISOString().replace('Z', '');
  const endTime = new Date(options.toTimestamp * 1000).toISOString().replace('Z', '');

  let count = await getFeeClaimsCount(formattedFeeSmartContract, startTime, endTime);

  if (!count) {
    return { dailyFees }
  }

  const maxDays = 30;
  let currentDays = 0;

  while (count === 1 && currentDays < maxDays) {
    startTime = new Date(new Date(startTime).getTime() - oneDayInSeconds * 1000 * (currentDays + 1)).toISOString().replace('Z', '');
    count = await getFeeClaimsCount(formattedFeeSmartContract, startTime, endTime);
    currentDays++;
  }

  const fee = await getFee(formattedFeeSmartContract, startTime, endTime, count);

  dailyFees.addGasToken(BigInt(fee).toString());

  return { dailyFees }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.COINWEB]: {
      fetch,
    }
  },
  methodology: {
    Fees: 'All fees paid by users for finalising transactions.',
    Revenue: 'All fees are distributed to PactSwap fee pool.',
    ProtocolRevenue: 'All fees are distributed to PactSwap fee pool.',
  }
};

export default adapter;
