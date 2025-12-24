import { FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const SEAMLESS_GOVERNOR_SHORT_TIMELOCK =
  '0x639d2dD24304aC2e6A691d8c1cFf4a2665925fee';
const MORPHO_VAULTS_FACTORY_v1_1 = '0xFf62A7c278C62eD665133147129245053Bbf5918';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const abis = {
  createMetaMorpho:
    'event CreateMetaMorpho(address indexed metaMorpho, address indexed caller, address initialOwner, uint256 initialTimelock, address indexed asset, string name, string symbol, bytes32 salt)',
  transfer:
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  owner: 'function owner() public view returns (address)',
  asset: 'function asset() public view returns (address)',
  feeRecipient: 'function feeRecipient() public view returns (address)',
  convertToAssets:
    'function convertToAssets(uint256 shares) view returns (uint256 assets)',
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const allVaultLogs = await options.getLogs({
    target: MORPHO_VAULTS_FACTORY_v1_1,
    eventAbi: abis.createMetaMorpho,
    fromBlock: 24831748,
    flatten: false,
  });

  const allVaults = allVaultLogs.map((log: any) => log.metaMorpho);

  if (!allVaults.length) {
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
    };
  }

  const allVaultOwners = await options.api.multiCall({
    calls: allVaults,
    abi: abis.owner,
    permitFailure: true,
  });

  const seamlessVaults = allVaults.filter(
    (_: string, i: number) =>
      allVaultOwners[i] &&
      allVaultOwners[i].toLowerCase() ===
        SEAMLESS_GOVERNOR_SHORT_TIMELOCK.toLowerCase()
  );

  if (!seamlessVaults.length) {
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
    };
  }

  const [feeRecipients, underlyingAssets] = await Promise.all([
    options.api.multiCall({
      calls: seamlessVaults,
      abi: abis.feeRecipient,
      permitFailure: true,
    }),
    options.api.multiCall({
      calls: seamlessVaults,
      abi: abis.asset,
      permitFailure: true,
    }),
  ]);

  for (let i = 0; i < seamlessVaults.length; i++) {
    const vault = seamlessVaults[i];
    const feeRecipient = feeRecipients[i];
    const underlyingAsset = underlyingAssets[i];

    if (!feeRecipient || !underlyingAsset) continue;

    const transferLogs = await options.getLogs({
      target: vault,
      eventAbi: abis.transfer,
    });

    const feeSharesMinted = transferLogs
      .filter(
        (log: any) =>
          log.from.toLowerCase() === ZERO_ADDRESS.toLowerCase() &&
          log.to.toLowerCase() === feeRecipient.toLowerCase()
      )
      .reduce((total: bigint, log: any) => total + BigInt(log.value), 0n);

    if (feeSharesMinted > 0n) {
      const feeAssets = await options.api.call({
        target: vault,
        abi: abis.convertToAssets,
        params: [String(feeSharesMinted)],
      });

      dailyFees.add(underlyingAsset, feeAssets, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(underlyingAsset, feeAssets, METRIC.PERFORMANCE_FEES);
      dailyProtocolRevenue.add(
        underlyingAsset,
        feeAssets,
        METRIC.PERFORMANCE_FEES
      );
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: 'Performance fees collected by Seamless protocol from Morpho vault yields. Fees are tracked via vault share mints (Transfer events from 0x0) to protocol-controlled fee recipient addresses. Fee shares are converted to underlying assets using on-chain conversion functions.',
  Revenue:
    'All performance fees collected by Seamless protocol. Fees accrue when vault shares are minted to the fee recipient address.',
  ProtocolRevenue:
    'All performance fees are retained by the Seamless protocol treasury (Seamless Governor Short Timelock).',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-12-07',
    },
  },
  methodology,
};

export default adapter;
