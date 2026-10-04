import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// zipcoin: a Privacy Pools deployment for the ZC token on Ethereum, plus contracts that spend a
// private note to burn ZC for a public message ("the Book"), gift ZC to an address, pay DAI/ETH,
// or swap ZC to ETH. Contracts: https://github.com/zipcoincash/zipcoin, https://www.zipcoin.cash/docs
const ZC = "0x4E67DB19044549fF420860834c91b45BaD298722";
const ENTRYPOINT = "0x7a8DA01D241C3cFcF7803cdB007EcE5663749193"; // zipcoin's Privacy Pools Entrypoint
const BOW_ENTRYPOINT = "0x6818809EefCe719E480a7526D76bD3e561526b46"; // 0xbow's canonical Privacy Pools Entrypoint
const RELAYER = "0xd9B687c3c7093c37d0d2Ba53a51354215782B943"; // relayer operated by the zipcoin team
const BROADCASTER = "0x992550B536749125D63d5F9c19fea765232D6928"; // ZipBroadcaster: burn ZC to post
const DOORSTEP = "0x1813A541FB107C5E9b46e9cbB04e67140bCE7730"; // ZipDoorstep: burn ZC to post at an address, optional gift
const HEARTH = "0x5D711e59DeEBfAFbC8223eBE9A8f4Df286Af0531"; // ZipHearth: ETH note -> buy ZC -> burn to post
const TELLER = "0x555E8A0CEAD850Ac195BAf160Aead84d5C8826ff"; // ZipTeller: ZC note -> DAI payment
const TELLER_ETH = "0x7EAA5f0cb82232F7a673ef0fA74a2B2264b336F0"; // ZipTellerEth: ETH note -> DAI payment
const CHANGER = "0x858f4156E3C8319CA4dF14d3b46e398E0EFf3295"; // ZipChanger: ZC note -> ETH
// ZipTellerStable: stablecoin notes (0xbow pools) -> DAI payment; the fee is charged in the note's asset
const TELLER_STABLE: Record<string, string> = {
  "0x65614F5c532e525891302B7eD6050f5B6b777dAd": ADDRESSES.ethereum.DAI,
  "0x0F6E7E5269be27e8f40C55DE5FFc5E99abCC406f": ADDRESSES.ethereum.USDC,
  "0xc3288A1cA1206D9EA0b21caF7daF03B8f831FC13": ADDRESSES.ethereum.USDT,
};
// Team wallets (https://www.zipcoin.cash/analytics labels them): their public burns are team-funded supply
// reductions, not fees paid by users, so they are excluded. Anonymous posts cannot be attributed.
const TEAM = new Set([
  "0x49071f087c949cda8e05969999e9e6cfeab5c279", // dev / deployer
  "0x7d942ef2681bc82eb1cd6c46305598489fbbf402", // treasury
  "0x976aa92285043e22c4dfcb7bc4dde9915a92df62", // team
]);

const BPS = 10_000n;

const METRICS = {
  BURN_TO_POST: "Burn-to-Post Fees",
  RELAY_FEES: "Relay Fees",
  VETTING_FEES: "Deposit Vetting Fees",
};

const abis = {
  deposited: "event Deposited(address indexed _depositor, address indexed _pool, uint256 _commitment, uint256 _amount)",
  withdrawalRelayed: "event WithdrawalRelayed(address indexed _relayer, address indexed _recipient, address indexed _asset, uint256 _amount, uint256 _feeAmount)",
  assetConfig: "function assetConfig(address asset) view returns (address pool, uint256 minimumDepositAmount, uint256 vettingFeeBPS, uint256 maxRelayFeeBPS)",
  spoken: "event Spoken(address indexed speaker, uint256 indexed nullifierHash, uint256 burned, uint256 fee, string message, string target)",
  doorSpoken: "event Spoken(address indexed speaker, address indexed to, uint256 indexed nullifierHash, uint256 burned, uint256 gift, uint256 fee, string message, string target)",
  hearth: "event Hearth(address indexed to, uint256 nullifierHash, uint256 ethIn, uint256 zcBurned, uint256 gift, uint256 fee)",
  tellerPaid: "event Paid(address indexed to, uint256 nullifierHash, uint256 zcIn, uint256 daiOut, uint256 fee)",
  tellerEthPaid: "event Paid(address indexed to, uint256 nullifierHash, uint256 ethIn, uint256 daiOut, uint256 fee)",
  tellerStablePaid: "event Paid(address indexed to, uint256 nullifierHash, uint256 assetIn, uint256 daiOut, uint256 fee)",
  changed: "event Changed(address indexed to, uint256 nullifierHash, uint256 zcIn, uint256 ethOut, uint256 fee)",
};

const addressTopic = (address: string) => ethers.zeroPadValue(address.toLowerCase(), 32);
const eventTopic = (eventAbi: string) => (new ethers.Interface([eventAbi]).fragments[0] as ethers.EventFragment).topicHash;
const token = (asset: string) => asset.toLowerCase() === ADDRESSES.GAS_TOKEN_2 ? ADDRESSES.null : asset;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const burned = (speaker: string, amount: any) => {
    if (TEAM.has(speaker.toLowerCase())) return;
    dailyFees.add(ZC, amount, METRICS.BURN_TO_POST);
    dailyRevenue.add(ZC, amount, METRICS.BURN_TO_POST);
    dailyHoldersRevenue.add(ZC, amount, METRICS.BURN_TO_POST);
  };
  // Relay fees of the zipcoin processooor contracts are paid to whichever relayer submits the transaction;
  // the events do not name it, and the only relayer in use is the one the team runs, so they are protocol revenue.
  const relayFee = (asset: string, amount: any) => {
    dailyFees.add(asset, amount, METRICS.RELAY_FEES);
    dailyRevenue.add(asset, amount, METRICS.RELAY_FEES);
    dailyProtocolRevenue.add(asset, amount, METRICS.RELAY_FEES);
  };

  // Burn-to-post: ZC destroyed to publish a word, straight from a wallet or from a private note.
  const spoken = await options.getLogs({ target: BROADCASTER, eventAbi: abis.spoken });
  spoken.forEach((log: any) => {
    burned(log.speaker, log.burned);
    relayFee(ZC, log.fee);
  });
  const doorSpoken = await options.getLogs({ target: DOORSTEP, eventAbi: abis.doorSpoken });
  doorSpoken.forEach((log: any) => {
    burned(log.speaker, log.burned); // the gift goes to the door's owner and is not a fee
    relayFee(ZC, log.fee);
  });
  const hearth = await options.getLogs({ target: HEARTH, eventAbi: abis.hearth });
  hearth.forEach((log: any) => {
    burned(ADDRESSES.null, log.zcBurned); // always from a private ETH note, no speaker
    relayFee(ADDRESSES.null, log.fee);
  });

  // Private payments and swaps: only the relay fee is a fee; the paid-out amount belongs to the recipient.
  const tellerPaid = await options.getLogs({ target: TELLER, eventAbi: abis.tellerPaid });
  tellerPaid.forEach((log: any) => relayFee(ZC, log.fee));
  const tellerEthPaid = await options.getLogs({ target: TELLER_ETH, eventAbi: abis.tellerEthPaid });
  tellerEthPaid.forEach((log: any) => relayFee(ADDRESSES.null, log.fee));
  for (const [teller, asset] of Object.entries(TELLER_STABLE)) {
    const paid = await options.getLogs({ target: teller, eventAbi: abis.tellerStablePaid });
    paid.forEach((log: any) => relayFee(asset, log.fee));
  }
  const changed = await options.getLogs({ target: CHANGER, eventAbi: abis.changed });
  changed.forEach((log: any) => relayFee(ZC, log.fee));

  // Plain withdrawals through the zipcoin Entrypoint: the relay fee goes to the named relayer.
  const relays = await options.getLogs({ target: ENTRYPOINT, eventAbi: abis.withdrawalRelayed });
  relays.forEach((log: any) => {
    const asset = token(log._asset);
    dailyFees.add(asset, log._feeAmount, METRICS.RELAY_FEES);
    if (log._relayer.toLowerCase() === RELAYER.toLowerCase()) {
      dailyRevenue.add(asset, log._feeAmount, METRICS.RELAY_FEES);
      dailyProtocolRevenue.add(asset, log._feeAmount, METRICS.RELAY_FEES);
    } else {
      dailySupplySideRevenue.add(asset, log._feeAmount, METRICS.RELAY_FEES);
    }
  });
  // The same relayer also serves withdrawals from 0xbow's ETH and stablecoin pools (zipcoin's site offers them);
  // those fees are paid to it in the pool's asset.
  const bowRelays = await options.getLogs({
    target: BOW_ENTRYPOINT,
    eventAbi: abis.withdrawalRelayed,
    topics: [eventTopic(abis.withdrawalRelayed), addressTopic(RELAYER)],
  });
  bowRelays.forEach((log: any) => relayFee(token(log._asset), log._feeAmount));

  // Deposit vetting fee: the Entrypoint keeps vettingFeeBPS of each deposit; Deposited.amount is net of it.
  const deposits = await options.getLogs({ target: ENTRYPOINT, eventAbi: abis.deposited });
  if (deposits.length) {
    const pools = [...new Set(deposits.map((log: any) => log._pool.toLowerCase()))];
    const assets: string[] = await options.api.multiCall({ abi: "address:ASSET", calls: pools });
    const configs = await options.api.multiCall({ target: ENTRYPOINT, abi: abis.assetConfig, calls: assets });
    const feeBpsByPool = Object.fromEntries(pools.map((pool, i) => [pool, BigInt(configs[i].vettingFeeBPS)]));
    const assetByPool = Object.fromEntries(pools.map((pool, i) => [pool, token(assets[i])]));
    deposits.forEach((log: any) => {
      const pool = log._pool.toLowerCase();
      const feeBps = feeBpsByPool[pool];
      if (!feeBps) return;
      const fee = (BigInt(log._amount) * feeBps) / (BPS - feeBps);
      dailyFees.add(assetByPool[pool], fee, METRICS.VETTING_FEES);
      dailyRevenue.add(assetByPool[pool], fee, METRICS.VETTING_FEES);
      dailyProtocolRevenue.add(assetByPool[pool], fee, METRICS.VETTING_FEES);
    });
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "ZC burned by users to publish in the Book, relay fees on private posts, payments and withdrawals, and deposit vetting fees of the ZC privacy pool. The launcher share of Stockereum's swap fee on ZC trades is a token tax and is not counted.",
  Revenue: "All fees: burns accrue to holders, the rest to the protocol; no supply-side payments except relay fees earned by third-party relayers.",
  ProtocolRevenue: "Relay fees earned by the team-run relayer and deposit vetting fees kept by the Entrypoint.",
  HoldersRevenue: "ZC permanently burned by users to post.",
  SupplySideRevenue: "Relay fees on zipcoin Entrypoint withdrawals submitted by relayers other than the team's.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.BURN_TO_POST]: "ZC sent to the burn address by users to publish a word via ZipBroadcaster, ZipDoorstep or ZipHearth (which buys ZC with ETH and burns it). Public burns from the team's own wallets are excluded.",
    [METRICS.RELAY_FEES]: "Basis-point fee on the withdrawn value paid to the relayer that submits a private post, payment, swap or withdrawal, in the note's asset (ZC, ETH, DAI, USDC or USDT).",
    [METRICS.VETTING_FEES]: "Fee the zipcoin Entrypoint deducts from each deposit into the ZC privacy pool (assetConfig.vettingFeeBPS).",
  },
  Revenue: {
    [METRICS.BURN_TO_POST]: "Burned ZC; see HoldersRevenue.",
    [METRICS.RELAY_FEES]: "Relay fees earned by the team-run relayer.",
    [METRICS.VETTING_FEES]: "Vetting fees kept by the Entrypoint, withdrawable by its owner.",
  },
  ProtocolRevenue: {
    [METRICS.RELAY_FEES]: "Relay fees earned by the team-run relayer.",
    [METRICS.VETTING_FEES]: "Vetting fees kept by the Entrypoint, withdrawable by its owner.",
  },
  HoldersRevenue: {
    [METRICS.BURN_TO_POST]: "ZC permanently removed from supply when users post.",
  },
  SupplySideRevenue: {
    [METRICS.RELAY_FEES]: "Relay fees on zipcoin Entrypoint withdrawals submitted by third-party relayers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-09-27", // ZC pool registered and ZC launched on Stockereum, block 26070390
  methodology,
  breakdownMethodology,
};

export default adapter;
