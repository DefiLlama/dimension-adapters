import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";

type TokenMinted = {
  sender: string;
  recipient: string;
  value: string; // Token
};

async function apeMetrics(options: FetchOptions): Promise<{
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailyVolume: Balances;
}> {
  const { createBalances } = options;
  const USER_CONTRACT = "0x6EA76F01Aa615112AB7de1409EFBD80a13BfCC84";
  let dailyVolume = createBalances();
  let dailyFees = createBalances();
  let dailyRevenue = createBalances();
  let dailyProtocolRevenue = createBalances();

  const BASE_FEE = BigInt(20);
  const FEE_DENOM = BigInt(1000);
  const BASE_REV_RATE = BigInt(250);

  const wagerLogs = await options.getLogs({
    target: USER_CONTRACT,
    eventAbi:
      "event Transfer(address indexed from, address indexed to, uint256 value)",
  });

  wagerLogs.map((log: TokenMinted) => {
    const nativeAmount = BigInt(log.value);
    const feeAmount = (nativeAmount * BASE_FEE) / FEE_DENOM;
    const protocolRev = (feeAmount * BASE_REV_RATE) / FEE_DENOM;
    dailyVolume.addGasToken(nativeAmount);
    dailyFees.addGasToken(feeAmount);
    dailyRevenue.addGasToken(feeAmount);
    dailyProtocolRevenue.addGasToken(protocolRev);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch: apeMetrics,
  chains: [CHAIN.APECHAIN],
  start: "2025-09-11", // "YYYY-MM-DD" format
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
