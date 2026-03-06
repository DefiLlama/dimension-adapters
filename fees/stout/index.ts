import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// protocol accepts collateral in either usdc or tether
const tokens = {
  usdc: ADDRESSES.sonic.USDC_e,
  usdt: ADDRESSES.sonic.USDT,
};

// each relevant peg stability module for the tokens above
const psm = {
  usdc: "0x24E2A86176F209CcE828714c48f804fd7444A89a",
  usdt: "0xB969195dB5d756AC7a7EA78a69F20Fe1f172a494",
};

const methodology = {
  Revenue: "10% of tokens used to mint STTX gets sent to the treasury",
};

async function fetch({ createBalances, getLogs }: FetchOptions) {
  const fees = createBalances();

  const logFees = (tokenAddress, logs) => {
    logs.forEach((log: any) => {
      // logs only show 90% which goes to the contract
      const emittedAmount = Number(log.stableIn);

      // we need to calculate 100%
      const fullAmount = emittedAmount * (1 / 0.9);

      // 10% goes to treasury contract
      const treasuryAmount = fullAmount * (10 / 100);
      fees.add(tokenAddress, treasuryAmount);
    });
  };

  const usdcLogs = await getLogs({
    target: psm.usdc,
    eventAbi:
      "event StableForDUSXSwapped(uint256 stableIn, uint256 mintedDUSX)",
  });
  logFees(tokens.usdc, usdcLogs);

  const usdtLogs = await getLogs({
    target: psm.usdt,
    eventAbi:
      "event StableForDUSXSwapped(uint256 stableIn, uint256 mintedDUSX)",
  });
  logFees(tokens.usdt, usdtLogs);

  return {
    dailyRevenue: fees,
    dailyFees: fees
  };
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      // Saturday, 1 March 2025 00:00:00
      start: '2025-03-01',
    },
  },
  methodology,
};

export default adapter;
