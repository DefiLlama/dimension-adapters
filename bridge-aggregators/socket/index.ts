import { Interface } from "ethers";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { SocketVaults } from "./contracts";
import * as sdk from '@defillama/sdk'

const SocketVaultAbis = {
  TokensDeposited: 'event TokensDeposited(address connector, address depositor, address receiver, uint256 depositAmount)',
  TokensUnlocked: 'event TokensUnlocked(address connector, address receiver, uint256 unlockedAmount)',
  TokensBridged: 'event TokensBridged(address connecter, address receiver, uint256 amount, bytes32 messageId)',
  BridgingTokens: 'event BridgingTokens(address connector, address sender, address receiver, uint256 amount, bytes32 messageId)',
}

export function getToken(chain: string, vaultAddress: string): string | null {
  vaultAddress = sdk.util.normalizeAddress(vaultAddress)
  
  if (SocketVaults[chain]) {
    for (const [vault, token] of Object.entries(SocketVaults[chain])) {
      if (sdk.util.normalizeAddress(vault) === vaultAddress) {
        return token;
      }
    }
  }

  return null;
}

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyBridgeVolume = options.createBalances()

  const vaultContract = new Interface(Object.values(SocketVaultAbis))

  // deposit to layer 2
  const depositEvents = (await options.getLogs({
    eventAbi: SocketVaultAbis.TokensDeposited,
    entireLog: true,
    targets: Object.keys(SocketVaults[options.chain]),
  })).map(log => {
    const decoded = vaultContract.parseLog(log)
    const token = getToken(options.chain, log.address)
    if (decoded && token) {
      return {
        vault: log.address,
        token: token,
        amount: decoded.args.depositAmount,
      }
    }
    return null;
  }).filter(event => event !== null)
  const tokensBridgedEvents = (await options.getLogs({
    eventAbi: SocketVaultAbis.TokensBridged,
    entireLog: true,
    targets: Object.keys(SocketVaults[options.chain]),
  })).map(log => {
    const decoded = vaultContract.parseLog(log)
    const token = getToken(options.chain, log.address)
    if (decoded && token) {
      return {
        vault: log.address,
        token: token,
        amount: decoded.args.amount,
      }
    }
    return null;
  }).filter(event => event !== null)
  const bridgingTokensEvents = (await options.getLogs({
    eventAbi: SocketVaultAbis.BridgingTokens,
    entireLog: true,
    targets: Object.keys(SocketVaults[options.chain]),
  })).map(log => {
    const decoded = vaultContract.parseLog(log)
    const token = getToken(options.chain, log.address)
    if (decoded && token) {
      return {
        vault: log.address,
        token: token,
        amount: decoded.args.amount,
      }
    }
    return null;
  }).filter(event => event !== null)

  // withdraw from layer 2
  const withdrawEvents = (await options.getLogs({
    eventAbi: SocketVaultAbis.TokensUnlocked,
    entireLog: true,
    targets: Object.keys(SocketVaults[options.chain]),
  })).map(log => {
    const decoded = vaultContract.parseLog(log)
    const token = getToken(options.chain, log.address)
    if (decoded && token) {
      return {
        vault: log.address,
        token: token,
        amount: decoded.args.unlockedAmount,
      }
    }
    return null;
  }).filter(event => event !== null)

  // counting volumes
  for (const event of depositEvents.concat(tokensBridgedEvents).concat(bridgingTokensEvents).concat(withdrawEvents)) {
    dailyBridgeVolume.add(event.token, event.amount)
  }

  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(SocketVaults).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: '2023-08-10', }
    }
  }, {})
};

export default adapter;
