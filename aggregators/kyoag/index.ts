import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const LEGACY_ROUTERS: Record<string, string[]> = {
  [CHAIN.HYPERLIQUID]: [
    "0x5d78854510a2d008E2E21c2fAB4Cc78582B0F2Ce",
    "0x91B81ACd2Ee2D8F26518139Af632c56Fad28Dcb4",
  ],
  [CHAIN.SONEIUM]: [
    "0xD2dFd922fd6bBAe0399F68F99CD444adbd80d255",
    "0xf4087AFfE358c1f267Cca84293abB89C4BD10712",
  ],
};

// Router delegates execution to logic contracts passed in calldata, so keep a small
// manual allowlist of known logic contracts per chain and index inflows to both.
const LOGICS: Record<string, string[]> = {
  [CHAIN.HYPERLIQUID]: [
    "0x775f533c082a466156bd0e771957853375c96265",
    "0xE34E1A6b31D90ED63E1e8EB0640495978b4eB172",
    "0xD3027e4869da32d3c295271E4c8d4c4f6C170464",
    "0xcb7a9dF8074c2a2c06496b8Bee28372051f3abd7",
    "0x69E896668A0dDe9450C8EdD8c1D2Cee2bF99A9a9",
    "0xC049cA5Fa95CdE6Fd4ADCeaFaaf331A6bb33C435",
    "0xF8A773940Dee10144D5204c44749220e8FFa7b49",
    "0x7A34F2C757589825aa795aa98B72F301A8980be0",
    "0x0cB398DE0616c8E7b2b737fF715ACcDc888e99ce",
    "0x484408554626d420DE940f91786Ffb4913A78000",
    "0x734b73B13594638a11f59B35257390738D08543d",
  ],
  [CHAIN.SONEIUM]: [
    "0xB3f8F67230CbAcD5Adf297BE3F1884A845c9c3C0",
    "0xd118e1c57d347D13BF2b14Bd665B74b7B56AF563",
    "0xC049cA5Fa95CdE6Fd4ADCeaFaaf331A6bb33C435",
    "0x36af20bc2d7F1B3cBd9cADC61395a3c5c56A75D0",
    "0x26Dd7F2672C96761280DC2f7Ad9D431e518002e9",
    "0xf582CBB0788323FAaCB00a6677caF4890ed19aCF",
    "0xaec97346c8d562EccfBa46325d00Af3fFB7246d0",
    "0x23120352144E920dbAC60bcDa2d78dE4845A084f",
  ],
};

const EVENT_ROUTERS: Record<string, string[]> = {
  [CHAIN.HYPERLIQUID]: ["0x463E176246c4fF727153a8b98381531df1B66b80"],
  [CHAIN.SONEIUM]: ["0x206D7FBBD740780D7eFf488D40744276e8dAf077"],
  [CHAIN.MONAD]: ["0x852a57ae203fec9c96c7ac9a774db048cbe4e34e"],
};

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DEPOSIT_TOPIC =
  "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const SWAP_EXECUTED_EVENT =
  "event SwapExecuted(address indexed sender, address indexed srcToken, address indexed dstToken, address logic, uint256 amountIn, uint256 amountOut)";

const WRAPPED_NATIVE_TOKENS: Record<string, string[]> = {
  [CHAIN.HYPERLIQUID]: [ADDRESSES.hyperliquid.WHYPE],
  [CHAIN.SONEIUM]: [ADDRESSES.soneium.WETH],
  [CHAIN.MONAD]: [ADDRESSES.monad.WMON, ADDRESSES.monad.WETH],
};

const isPositiveAmount = (amount?: string) => {
  if (!amount || amount === "0x") return false;
  try {
    return BigInt(amount) > 0n;
  } catch {
    return false;
  }
};

const addVolume = (
  dailyVolume: ReturnType<FetchOptions["createBalances"]>,
  token?: string,
  amount?: string,
) => {
  if (!token || !isPositiveAmount(amount)) return;
  if (token.toLowerCase() === NATIVE_TOKEN.toLowerCase()) dailyVolume.addGasToken(amount);
  else dailyVolume.add(token, amount);
};

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyVolume = createBalances();
  const eventRouters = EVENT_ROUTERS[chain] ?? [];
  const trackedTargets = [...eventRouters, ...(LEGACY_ROUTERS[chain] ?? []), ...(LOGICS[chain] ?? [])];
  const trackedSet = new Set(trackedTargets.map((r) => r.toLowerCase()));
  const wrappedNativeSet = new Set((WRAPPED_NATIVE_TOKENS[chain] ?? []).map((a) => a.toLowerCase()));
  const allLogs: any[] = [];
  const eventTxs = new Set<string>();

  if (eventRouters.length) {
    const eventLogs = await getLogs({
      targets: eventRouters,
      eventAbi: SWAP_EXECUTED_EVENT,
      onlyArgs: false,
    });

    for (const log of eventLogs) {
      const txHash = (log.transactionHash as string | undefined)?.toLowerCase();
      if (txHash) eventTxs.add(txHash);
      addVolume(
        dailyVolume,
        log.srcToken ?? log.args?.srcToken,
        log.amountIn ?? log.args?.amountIn,
      );
    }
  }

  for (const target of trackedTargets) {
    const padded = ethers.zeroPadValue(target, 32);

    const [transferLogs, depositLogs] = await Promise.all([
      getLogs({
        topics: [TRANSFER_TOPIC, null as any, padded],
        noTarget: true,
        eventAbi:
          "event Transfer(address indexed from, address indexed to, uint256 value)",
        entireLog: true,
      }),
      getLogs({
        topics: [DEPOSIT_TOPIC, padded],
        noTarget: true,
        eventAbi: "event Deposit(address indexed dst, uint256 wad)",
        entireLog: true,
      }),
    ]);

    for (const log of transferLogs) {
      if (!isPositiveAmount(log.data)) continue;
      const txHash = (log.transactionHash as string | undefined)?.toLowerCase();
      if (!txHash) continue;
      if (eventTxs.has(txHash)) continue;
      // Exclude transfers from other tracked contracts (router/logic internal routing)
      if (!log.topics?.[1]) continue;
      const from = "0x" + log.topics[1].slice(26).toLowerCase();
      if (trackedSet.has(from)) continue;
      allLogs.push(log);
    }

    for (const log of depositLogs) {
      if (!isPositiveAmount(log.data)) continue;
      const txHash = (log.transactionHash as string | undefined)?.toLowerCase();
      if (!txHash) continue;
      if (eventTxs.has(txHash)) continue;
      const emitter = (log.address as string | undefined)?.toLowerCase();
      if (!emitter || !wrappedNativeSet.has(emitter)) continue;
      allLogs.push(log);
    }
  }

  // Per transaction: keep only the first inbound transfer/deposit (lowest log index).
  // This is the sell-token inflow before DEX routing, internal hops, or fee payouts.
  const firstByTx: Record<string, any> = {};
  for (const log of allLogs) {
    const txHash = (log.transactionHash as string | undefined)?.toLowerCase();
    if (!txHash) continue;
    const idx = log.logIndex ?? log.index ?? 0;
    const prev = firstByTx[txHash];
    if (!prev || idx < (prev.logIndex ?? prev.index ?? 0)) {
      firstByTx[txHash] = log;
    }
  }

  for (const log of Object.values(firstByTx)) {
    addVolume(dailyVolume, log.address, log.data);
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "New KYO AG routers are indexed from SwapExecuted events using the srcToken " +
    "amountIn side when present. Routers or methods that do not emit a swap event " +
    "(including legacy routers and swapMulti flows) are indexed via the earliest " +
    "inbound ERC-20 Transfer or wrapped-native Deposit to the router or allowlisted " +
    "logic contract; internal hops and fee payouts are excluded.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HYPERLIQUID]: { fetch, start: "2026-02-03" },
    [CHAIN.MONAD]: { fetch, start: "2026-03-23" },
    [CHAIN.SONEIUM]: { fetch, start: "2025-12-30" },
  },
  methodology,
};

export default adapter;
