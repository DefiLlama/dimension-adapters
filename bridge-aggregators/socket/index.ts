import { Interface } from "ethers";
import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { SocketVaults } from "./contracts";

const SocketVaultAbis = {
  TokensDeposited: "event TokensDeposited(address connector, address depositor, address receiver, uint256 depositAmount)",
  TokensUnlocked: "event TokensUnlocked(address connector, address receiver, uint256 unlockedAmount)",
  TokensBridged: "event TokensBridged(address connecter, address receiver, uint256 amount, bytes32 messageId)",
  BridgingTokens: "event BridgingTokens(address connector, address sender, address receiver, uint256 amount, bytes32 messageId)",
};

function getToken(chain: string, vaultAddress: string): string | null {
  vaultAddress = sdk.util.normalizeAddress(vaultAddress);
  if (SocketVaults[chain]) {
    for (const [vault, token] of Object.entries(SocketVaults[chain])) {
      if (sdk.util.normalizeAddress(vault) === vaultAddress) return token;
    }
  }
  return null;
}

const fetchVaultVolume = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const vaults = SocketVaults[options.chain];
  if (!vaults) return { dailyBridgeVolume };

  const vaultContract = new Interface(Object.values(SocketVaultAbis));
  const targets = Object.keys(vaults);
  const collect = async (eventAbi: string, amountKey: string) => {
    const logs = await options.getLogs({ eventAbi, entireLog: true, targets });
    for (const log of logs) {
      const decoded = vaultContract.parseLog(log);
      const token = getToken(options.chain, log.address);
      if (decoded && token) dailyBridgeVolume.add(token, decoded.args[amountKey]);
    }
  };
  await collect(SocketVaultAbis.TokensDeposited, "depositAmount");
  await collect(SocketVaultAbis.TokensBridged, "amount");
  await collect(SocketVaultAbis.BridgingTokens, "amount");
  await collect(SocketVaultAbis.TokensUnlocked, "unlockedAmount");
  return { dailyBridgeVolume };
};

const fetch = async (options: FetchOptions) => fetchVaultVolume(options);

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(SocketVaults).reduce((acc, chain) => ({
    ...acc,
    [chain]: { fetch, start: "2023-08-10" },
  }), {}),
};

export default adapter;
