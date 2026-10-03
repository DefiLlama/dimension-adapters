import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Unlock contract addresses on each chain
const UNLOCK_CONTRACTS: { [chain: string]: string } = {
  [CHAIN.ETHEREUM]: "0xe79B93f8E22676774F2A8dAd469175ebd00029FA",
  [CHAIN.OPTIMISM]: "0x99b1348a9129ac49c6de7F11245773dE2f51fB0c",
  [CHAIN.BSC]: "0xeC83410DbC48C7797D2f2AFe624881674c65c856",
  [CHAIN.XDAI]: "0x1bc53f4303c711cc693F6Ec3477B83703DcB317f",
  [CHAIN.POLYGON]: "0xE8E5cd156f89F7bdB267EabD5C43Af3d5AF2A78f",
  [CHAIN.BASE]: "0xd0b14797b9D08493392865647384974470202A78",
  [CHAIN.ARBITRUM]: "0x1FF7e338d5E582138C46044dc238543Ce555C963",
  [CHAIN.CELO]: "0x1FF7e338d5E582138C46044dc238543Ce555C963",
  [CHAIN.AVAX]: "0x70cBE5F72dD85aA634d07d2227a421144Af734b3",
  [CHAIN.LINEA]: "0x70B3c9Dd9788570FAAb24B92c3a57d99f8186Cc7",
  [CHAIN.ERA]: "0x32CF553582159F12fBb1Ae1649b3670395610F24",
  [CHAIN.POLYGON_ZKEVM]: "0x259813B665C8f6074391028ef782e27B65840d89",
  [CHAIN.SCROLL]: "0x259813B665C8f6074391028ef782e27B65840d89",
};

const abis = {
  GNPChanged: "event GNPChanged(uint256 grossNetworkProduct, uint256 _valueInETH, address tokenAddress, uint256 value, address lockAddress)",
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  isLockManager: "function isLockManager(address) view returns (bool)",
}

// A lock manager buying a key on its own lock pays itself: 99% of the price goes straight back to
// the lock and only the 1% protocol fee leaves. Done with a flash loan, it inflates the
// grossNetworkProduct counter by any amount at a cost of 1% (it is how the purchase reward is farmed).
// Returns the GNP added by purchases whose key was minted to a manager of the same lock.
const getSelfPurchaseGNP = async (options: FetchOptions): Promise<bigint> => {
  const gnpLogs = await options.getLogs({ target: UNLOCK_CONTRACTS[options.chain], eventAbi: abis.GNPChanged, entireLog: true, parseLog: true });
  if (!gnpLogs.length) return 0n;

  const locks = [...new Set<string>(gnpLogs.map((log: any) => log.args.lockAddress.toLowerCase()))];
  const mintLogs = await options.getLogs({ targets: locks, eventAbi: abis.Transfer, entireLog: true, parseLog: true, flatten: false });

  const recipientsByPurchase: Record<string, Set<string>> = {};
  mintLogs.forEach((logs: any[], i: number) => {
    for (const log of logs) {
      if (BigInt(log.args.from) !== 0n) continue;
      const key = `${log.transactionHash}-${locks[i]}`;
      (recipientsByPurchase[key] ??= new Set()).add(log.args.to.toLowerCase());
    }
  });

  const checks: { target: string; params: string[] }[] = [];
  for (const key of Object.keys(recipientsByPurchase)) {
    const lock = key.split("-")[1];
    for (const recipient of recipientsByPurchase[key]) checks.push({ target: lock, params: [recipient] });
  }
  const isManager = checks.length ? await options.toApi.multiCall({ abi: abis.isLockManager, calls: checks, permitFailure: true }) : [];
  const managers = new Set(checks.filter((_, i) => isManager[i] === true).map(c => `${c.target}-${c.params[0]}`));

  let selfPurchaseGNP = 0n;
  for (const log of gnpLogs) {
    const lock = log.args.lockAddress.toLowerCase();
    const recipients = recipientsByPurchase[`${log.transactionHash}-${lock}`];
    if (recipients && [...recipients].some(r => managers.has(`${lock}-${r}`))) selfPurchaseGNP += BigInt(log.args._valueInETH);
  }
  return selfPurchaseGNP;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const gnpStart = await options.fromApi.call({ target: UNLOCK_CONTRACTS[options.chain], abi: "uint256:grossNetworkProduct", permitFailure: true});
  const gnpEnd = await options.toApi.call({ target: UNLOCK_CONTRACTS[options.chain], abi: "uint256:grossNetworkProduct", permitFailure: true});

  if (gnpEnd && gnpStart) {
    const selfPurchaseGNP = await getSelfPurchaseGNP(options);
    const dailyGNP = Number(BigInt(gnpEnd) - BigInt(gnpStart) - selfPurchaseGNP);
  
    // Only add positive daily changes (handles resets/errors)
    if (dailyGNP > 0) {
      dailyFees.addGasToken(dailyGNP);
      dailyRevenue.addGasToken(dailyGNP * 0.01); // 1% to protocol
      dailySupplySideRevenue.addGasToken(dailyGNP * 0.99); // 99% to creators
    }
    // the 1% protocol fee on a self-purchase is really paid, so it stays as fees and revenue
    if (selfPurchaseGNP > 0n) {
      dailyFees.addGasToken(Number(selfPurchaseGNP) * 0.01);
      dailyRevenue.addGasToken(Number(selfPurchaseGNP) * 0.01);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Gross network product delta recorded by each Unlock contract across supported chains.",
    Revenue: "Unlock DAO keeps the protocol fee (1% of each key purchase/renewal).",
    ProtocolRevenue: "Equal to total revenue because Unlock DAO accrues the entire protocol fee.",
    SupplySideRevenue: "Remaining 99% of the gross network product flows to individual lock creators.",
  },
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2020-06-01' },
    [CHAIN.OPTIMISM]: { fetch, start: '2021-11-11' },
    [CHAIN.BSC]: { fetch, start: '2021-09-09' },
    [CHAIN.XDAI]: { fetch, start: '2021-09-09' },
    [CHAIN.POLYGON]: { fetch, start: '2021-09-09' },
    [CHAIN.BASE]: { fetch, start: '2023-08-01' },
    [CHAIN.ARBITRUM]: { fetch, start: '2022-11-01' },
    [CHAIN.CELO]: { fetch, start: '2022-01-12' },
    [CHAIN.AVAX]: { fetch, start: '2022-02-21' },
    [CHAIN.LINEA]: { fetch, start: '2023-07-21' },
    [CHAIN.ERA]: { fetch, start: '2023-06-01' },
    [CHAIN.POLYGON_ZKEVM]: { fetch, start: '2023-06-01' },
    [CHAIN.SCROLL]: { fetch, start: '2023-10-16' },
  },
};

export default adapter;
