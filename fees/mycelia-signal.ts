import { Balances } from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPositionedLogArgs } from "../helpers/logs";
import { addTokensReceived } from "../helpers/token";
import coreAssets from "../helpers/coreAssets.json"

const USDC = coreAssets.base.USDC

// Mycelia's two revenue wallets:
//  1. Direct settlement — payTo of the Mycelia-operated TypeScript x402 proxy, full gross USDC
//  2. Orbis marketplace payouts — 80% net of Orbis-mediated revenue (Orbis
//     facilitator retains 20%); paid out to the configured payout address.
const DIRECT_WALLET = '0xD593832Ce9C2B13B192ba50B55dd9AF44e96700d'
const ORBIS_PAYOUT_WALLET = '0xfF51E0339A17f5fcBa6eAf0E06518d0042ac84bf'

// Orbis wallet that sends the payouts: the only sender into the payout wallet since launch, and the sender of
// a few payouts that landed in the direct wallet. The Mycelia team confirmed in PR #7484 it is not their wallet.
const ORBIS_PAYER = '0x2bB72231Eed303Cc91a462a1fa738B42B6a9aC6D'

// Mycelia-controlled wallets — used to exclude internal transfers
// (self-sends and cross-wallet transfers) from fee aggregation
const INTERNAL_ADDRESSES = new Set([DIRECT_WALLET, ORBIS_PAYOUT_WALLET].map(a => a.toLowerCase()));

const TRANSFER_EVENT = 'event Transfer(address indexed from, address indexed to, uint256 value)';
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const AUTHORIZATION_USED_EVENT = 'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)';
const AUTHORIZATION_USED_TOPIC = ethers.id('AuthorizationUsed(address,bytes32)');

const LABELS = {
  direct: 'Direct settlement',
  orbis: 'Orbis marketplace payouts (80% net)',
};

// x402 "exact" payments in USDC settle through EIP-3009 transferWithAuthorization, where USDC emits
// AuthorizationUsed(payer) right before Transfer(payer -> payTo). Only transfers with that pairing are API
// payments. Plain transfers into the wallet are not, e.g. 13.8k USDC an exchange hot wallet passed through it
// on 2026-09-10 (tx 0x32d05570ae257652411b235d150495302c0575a560340c17c91e01c970271475, issue #9892).
const addX402Payments = async (options: FetchOptions, dailyFees: Balances) => {
  const transfers = await getPositionedLogArgs(options, {
    target: USDC,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, null, ethers.zeroPadValue(DIRECT_WALLET, 32)] as any,
  });
  const candidates = transfers.filter(t => {
    const from = t.from.toLowerCase();
    return t.value > 0n && from !== ORBIS_PAYER.toLowerCase() && !INTERNAL_ADDRESSES.has(from);
  });

  // payers per window are few, so one AuthorizationUsed query per payer is cheap
  const authorizations = new Set<string>();
  for (const payer of new Set(candidates.map(t => t.from.toLowerCase()))) {
    const logs = await getPositionedLogArgs(options, {
      target: USDC,
      eventAbi: AUTHORIZATION_USED_EVENT,
      topics: [AUTHORIZATION_USED_TOPIC, ethers.zeroPadValue(payer, 32)],
    });
    logs.forEach(l => authorizations.add(`${payer}-${l.blockNumber}-${l.logIndex}`));
  }

  for (const t of candidates) {
    if (authorizations.has(`${t.from.toLowerCase()}-${t.blockNumber}-${t.logIndex - 1}`))
      dailyFees.add(USDC, t.value, LABELS.direct);
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  await addX402Payments(options, dailyFees);

  const orbisPayouts = await addTokensReceived({
    options,
    token: USDC,
    targets: [ORBIS_PAYOUT_WALLET, DIRECT_WALLET],
    fromAddressFilter: ORBIS_PAYER,
  });
  dailyFees.addBalances(orbisPayouts, LABELS.orbis);

  // No supply-side or holder splits — protocol keeps 100% of fees.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Fees: "USDC payments received for Mycelia oracle API calls on Base. Counts x402 per-call payments settled to the direct settlement wallet (0xD593832Ce9C2B13B192ba50B55dd9AF44e96700d) and Orbis marketplace payouts, which are 80% of the revenue from Orbis-mediated traffic (Orbis retains 20% as a facilitator fee). Other USDC sent to the wallets, such as fund movements and internal transfers between Mycelia wallets, is excluded.",
  Revenue: "All USDC paid for Mycelia oracle API calls, kept by the protocol. There is no supply-side, LP, integrator, or token-holder revenue split.",
  ProtocolRevenue: "All USDC paid for Mycelia oracle API calls, which accumulates in the protocol-operated receiver wallets.",
  UserFees: "USDC paid per API call by end users (human or autonomous agent), directly via x402 or through the Orbis marketplace.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.direct]: 'x402 payments settled to 0xD593832Ce9C2B13B192ba50B55dd9AF44e96700d by the Mycelia-operated TypeScript x402 proxy (myceliasignal-x402-proxy.service), counted only when settled through USDC transferWithAuthorization. Represents full gross fees for direct path traffic.',
    [LABELS.orbis]: 'USDC paid out by the Orbis x402 marketplace wallet 0x2bB72231Eed303Cc91a462a1fa738B42B6a9aC6D to the configured payout address 0xfF51E0339A17f5fcBa6eAf0E06518d0042ac84bf (and a few payouts to the direct settlement wallet). Represents 80% of customer payments routed through Orbis (the remaining 20% is retained by Orbis as a facilitator fee).',
  },
  Revenue: {
    [LABELS.direct]: 'x402 payments settled to 0xD593832Ce9C2B13B192ba50B55dd9AF44e96700d by the Mycelia-operated TypeScript x402 proxy (myceliasignal-x402-proxy.service), counted only when settled through USDC transferWithAuthorization. Represents full gross fees for direct path traffic.',
    [LABELS.orbis]: 'USDC paid out by the Orbis x402 marketplace wallet 0x2bB72231Eed303Cc91a462a1fa738B42B6a9aC6D to the configured payout address 0xfF51E0339A17f5fcBa6eAf0E06518d0042ac84bf (and a few payouts to the direct settlement wallet). Represents 80% of customer payments routed through Orbis (the remaining 20% is retained by Orbis as a facilitator fee).',
  },
};

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2026-04-12',
    },
  },
};

export default adapter;
