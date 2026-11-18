import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

/*
Trestly (https://trestly.io) bridges USDT from Ethereum and BNB Chain to Kaspa as kUSDT, backed 1:1 by the USDT locked
in its vault (the same address on both chains). The vault charges a fee on each deposit (USDT in, kUSDT minted on
Kaspa) and on each payout (kUSDT burned on Kaspa, USDT paid out), keeps the fees apart from the backing, and all of them
go to the protocol. The vault's events count in 6-decimal units: on BNB Chain, whose USDT has 18 decimals, a unit is
10^12 of the token's smallest amount.
Open code: https://github.com/kaspador/kusdt-open
*/

const VAULT = "0xfa9869982542FB20baD929789B252b7b06EeE10e";
const DEPOSIT_FEES = "Deposit Fees";
const WITHDRAWAL_FEES = "Withdrawal Fees";

const EVENT_DEPOSIT =
  "event Deposit(uint64 indexed nonce, address indexed sender, uint8 ownerScheme, bytes32 owner, uint256 units, uint256 fee, uint256 minted)";
const EVENT_RELEASED =
  "event Released(bytes32 indexed redeemId, address indexed recipient, uint256 units, uint256 fee, uint256 payout)";

const chainConfig: Record<string, { start: string; usdt: string; scale: bigint }> = {
  [CHAIN.ETHEREUM]: { start: "2026-11-15", usdt: ADDRESSES.ethereum.USDT, scale: 1n },
  [CHAIN.BSC]: { start: "2026-11-15", usdt: ADDRESSES.bsc.USDT, scale: 10n ** 12n },
};

const fetch = async (options: FetchOptions) => {
  const { usdt, scale } = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const [deposits, withdrawals] = await Promise.all([
    options.getLogs({ target: VAULT, eventAbi: EVENT_DEPOSIT }),
    options.getLogs({ target: VAULT, eventAbi: EVENT_RELEASED }),
  ]);
  deposits.forEach((log: any) => dailyFees.add(usdt, BigInt(log.fee) * scale, DEPOSIT_FEES));
  withdrawals.forEach((log: any) => dailyFees.add(usdt, BigInt(log.fee) * scale, WITHDRAWAL_FEES));
  return { dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
};

const methodology = {
  Fees: "Fees users pay to bridge USDT between Ethereum or BNB Chain and Kaspa: a percentage of each deposit (USDT in, kUSDT out on Kaspa) and of each withdrawal (kUSDT back to USDT), with a minimum per transfer. The USDT locked to back kUSDT is not counted.",
  Revenue: "All fees users pay on Trestly bridge deposits and withdrawals, kept by the protocol.",
  ProtocolRevenue: "All fees users pay on Trestly bridge deposits and withdrawals, held in the vault for the protocol to withdraw.",
};

const breakdownMethodology = {
  Fees: {
    [DEPOSIT_FEES]: "Fee on each USDT deposit bridged to Kaspa as kUSDT: a percentage of the amount with a minimum, rising on days of heavy deposits. Kept even if the deposit is later refunded.",
    [WITHDRAWAL_FEES]: "Fee on each kUSDT withdrawal paid out as USDT on Ethereum or BNB Chain: a percentage of the amount with a minimum, counted when the USDT is paid out.",
  },
  Revenue: {
    [DEPOSIT_FEES]: "All deposit fees, kept by the protocol.",
    [WITHDRAWAL_FEES]: "All withdrawal fees, kept by the protocol.",
  },
  ProtocolRevenue: {
    [DEPOSIT_FEES]: "All deposit fees, held in the vault for the protocol to withdraw.",
    [WITHDRAWAL_FEES]: "All withdrawal fees, held in the vault for the protocol to withdraw.",
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
