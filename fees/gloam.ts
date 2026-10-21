import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Gloam's shielded pool (ShieldPoolPayments), the same address on both chains.
// Source: https://github.com/cryptoduke01/gloam/blob/main/contracts/src/ShieldPoolCore.sol
// Deploy txs: Robinhood Chain 0x585d7310a3b2c29d024ea1dd80ab6b58730df933c470f3ec928fa035d05917bd,
// Tempo 0x2a04959f8980c49506305c72ec68bed261af02d49b8701cad0aeb9c500f4814b
const POOL = "0x39e28cde55cab798874746ac52cb4b5cc99a0194";

// $GLOAM on Robinhood Chain, priced through its CoinGecko id (https://www.coingecko.com/en/coins/gloam).
const GLOAM = "0xdcd885f5c60b3ad49f6d58718696417314e8724d";

// unshield() keeps withdrawFeeBps (25 bps = 0.25% at launch, capped at 1% in the contract) of every
// cash-out in the pool as feesOwed[asset] and emits WithdrawFee. collectFees() later sends it to the
// fee recipient, so fees are counted when they are charged, not when they are collected.
const abis = {
  withdrawFee: "event WithdrawFee(bytes32 indexed nullifier, address indexed asset, uint256 fee)",
};

const chainConfig: Record<string, { start: string }> = {
  [CHAIN.ROBINHOOD]: { start: "2026-10-21" }, // deploy block 94194599
  [CHAIN.TEMPO]: { start: "2026-10-21" }, // deploy block 45172561
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({ target: POOL, eventAbi: abis.withdrawFee });
  for (const log of logs) {
    if (log.asset.toLowerCase() === GLOAM) dailyFees.addCGToken("gloam", Number(log.fee) / 1e18, METRIC.DEPOSIT_WITHDRAW_FEES);
    else dailyFees.add(log.asset, log.fee, METRIC.DEPOSIT_WITHDRAW_FEES);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Fees: "A 0.25% fee on every cash-out from the Gloam shielded pool. Deposits and private payments are free.",
  UserFees: "Users pay the 0.25% cash-out fee, taken from the amount they cash out.",
  Revenue: "All cash-out fees go to the Gloam fee recipient.",
  ProtocolRevenue: "All cash-out fees go to the Gloam fee recipient.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.25% of every cash-out (unshield) from the pool, read from WithdrawFee events.",
  },
  UserFees: {
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.25% of every cash-out, paid by the user cashing out.",
  },
  Revenue: {
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "All cash-out fees are kept by the protocol.",
  },
  ProtocolRevenue: {
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "All cash-out fees go to the Gloam fee recipient 0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
