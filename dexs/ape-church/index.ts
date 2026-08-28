import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type TokenMinted = {
  from: string;
  recipient: string;
  value: string; // Token
};

const USER_CONTRACT = "0x6EA76F01Aa615112AB7de1409EFBD80a13BfCC84";
const USER_CONTRACT_V2 = "0xb90636359a683fcD9Bc2F54623B5C52e48604f08";

const BASE_FEE = BigInt(25);
const FEE_DENOM = BigInt(1000);
const BASE_REV_RATE = BigInt(500);

async function fetch(options: FetchOptions) {
  let dailyVolume = options.createBalances();
  let dailyFees = options.createBalances();
  let dailyRevenue = options.createBalances();

  const wagerLogs = await options.getLogs({
    target: USER_CONTRACT,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
  });

  const wagerLogsV2 = await options.getLogs({
    target: USER_CONTRACT_V2,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
  });

  wagerLogs.map((log: TokenMinted) => {
    const nativeAmount = BigInt(log.value);
    const feeAmount = (nativeAmount * BASE_FEE) / FEE_DENOM;
    const protocolRev = (feeAmount * BASE_REV_RATE) / FEE_DENOM;
    dailyVolume.addGasToken(nativeAmount);
    dailyFees.addGasToken(feeAmount);
    dailyRevenue.addGasToken(protocolRev);
  });

  wagerLogsV2.map((log: TokenMinted) => {
    if (log.from !== USER_CONTRACT) {
        const nativeAmount = BigInt(log.value);
        const feeAmount = (nativeAmount * BASE_FEE) / FEE_DENOM;
        const protocolRev = (feeAmount * BASE_REV_RATE) / FEE_DENOM;
        dailyVolume.addGasToken(nativeAmount);
        dailyFees.addGasToken(feeAmount);
        dailyRevenue.addGasToken(protocolRev);
    }
  });
  
  const dailySupplySideRevenue = dailyFees.clone(1)
  dailySupplySideRevenue.subtract(dailyRevenue)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetch,
  chains: [CHAIN.APECHAIN],
  start: "2025-09-11", // "YYYY-MM-DD" format
  methodology: {
    Volume: 'Total wager amount from all user bets.',
    Fees: 'Charge 2.5% of wager amount.',
    Revenue: 'Share of 50% fees to protocol.',
    ProtocolRevenue: 'Share of 50% fees to protocol.',
    SupplySideRevenue: 'Share of 70% fees to house suppliers.',
  }
};

export default adapter;
