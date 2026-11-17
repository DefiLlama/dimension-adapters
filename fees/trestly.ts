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
const PAYOUT_FEES = "Payout Fees";

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
  const [deposits, payouts] = await Promise.all([
    options.getLogs({ target: VAULT, eventAbi: EVENT_DEPOSIT }),
    options.getLogs({ target: VAULT, eventAbi: EVENT_RELEASED }),
  ]);
  deposits.forEach((log: any) => dailyFees.add(usdt, BigInt(log.fee) * scale, DEPOSIT_FEES));
  payouts.forEach((log: any) => dailyFees.add(usdt, BigInt(log.fee) * scale, PAYOUT_FEES));
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "The fee the Trestly vault charges on each deposit (USDT bridged to Kaspa) and each payout (kUSDT bridged back to USDT), from its Deposit and Released events on Ethereum and BNB Chain.",
  Revenue: "All fees go to the protocol.",
  ProtocolRevenue: "All fees go to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [DEPOSIT_FEES]: "Fee on each USDT deposit into the vault (the Deposit event's fee).",
    [PAYOUT_FEES]: "Fee on each USDT payout from the vault (the Released event's fee).",
  },
  Revenue: {
    [DEPOSIT_FEES]: "Fee on each USDT deposit, kept by the protocol.",
    [PAYOUT_FEES]: "Fee on each USDT payout, kept by the protocol.",
  },
  ProtocolRevenue: {
    [DEPOSIT_FEES]: "Fee on each USDT deposit, kept by the protocol.",
    [PAYOUT_FEES]: "Fee on each USDT payout, kept by the protocol.",
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
