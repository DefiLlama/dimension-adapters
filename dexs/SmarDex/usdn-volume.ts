import { FetchOptions } from "../../adapters/types";
import { formatEther, ethers } from "ethers";
import { usdnAbi } from "./abis";
import { CONFIG } from "./config";
import { getPrices } from "../../utils/prices";

export class USDNVolumeService {
  private options: FetchOptions;

  constructor(options: FetchOptions) {
    this.options = options;
  }

  private getEventConfigs() {
    const { USDN, DIP_ACCUMULATOR } = CONFIG.CONTRACTS;
    const { USDN: USDN_TOKEN, WSTETH } = CONFIG.TOKENS;

    return [
      {
        abi: usdnAbi.vaultDepositEvent,
        token: USDN_TOKEN,
        valueIndex: 3,
        contract: USDN,
      },
      {
        abi: usdnAbi.vaultWithdrawalEvent,
        token: USDN_TOKEN,
        valueIndex: 3,
        contract: USDN,
      },
      {
        abi: usdnAbi.longOpenPositionEvent,
        token: WSTETH,
        valueIndex: 4,
        contract: USDN,
      },
      {
        abi: usdnAbi.longClosePositionEvent,
        token: WSTETH,
        valueIndex: 3,
        contract: USDN,
      },
      {
        abi: usdnAbi.liquidatedTickEvent,
        token: WSTETH,
        valueIndex: 4,
        contract: USDN,
      },
      {
        abi: usdnAbi.liquidatorRewarded,
        token: WSTETH,
        valueIndex: 1,
        contract: USDN,
      },
      {
        abi: usdnAbi.rebalancerDepositEvent,
        token: WSTETH,
        valueIndex: 1,
        contract: DIP_ACCUMULATOR,
      },
      {
        abi: usdnAbi.rebalancerWithdrawalEvent,
        token: WSTETH,
        valueIndex: 2,
        contract: DIP_ACCUMULATOR,
      },
    ];
  }

  public async getUsdnVolume(): Promise<number> {
    let totalVolumeUsd = 0;
    const eventConfigs = this.getEventConfigs();

    for (const config of eventConfigs) {
      const logs = await this.fetchEventLogs(config.abi, config.contract);
      const eventVolume = await this.calculateEventVolumeUsd(logs, config);
      totalVolumeUsd += eventVolume;
    }

    return totalVolumeUsd;
  }

  private async calculateEventVolumeUsd(
    logs: any[],
    config: { abi: any; token: string; valueIndex: number }
  ): Promise<number> {
    if (!logs.length) return 0;

    let eventVolumeUsd = 0;
    const tokenApiKey = `ethereum:${config.token.toLowerCase()}`;
    const batchSize = 10;

    for (let i = 0; i < logs.length; i += batchSize) {
      const batch = logs.slice(i, i + batchSize);

      const volumes = await Promise.all(
        batch.map(async (log) => {
          try {
            const decodedData = this.decodeLog(log, config.abi);
            if (!decodedData) return 0;

            const block = await this.options.api.provider.getBlock(
              log.blockNumber
            );
            if (!block) return 0;

            const priceData = await getPrices([tokenApiKey], block.timestamp);
            const price = this.validateNumber(priceData[tokenApiKey]?.price);

            const valueRaw = decodedData[config.valueIndex] || BigInt(0);
            const valueEther = parseFloat(formatEther(valueRaw));
            return valueEther * price;
          } catch (error) {
            console.error("Error processing log:", error);
            return 0;
          }
        })
      );

      eventVolumeUsd += volumes.reduce((sum, val) => sum + val, 0);
    }

    return eventVolumeUsd;
  }

  private decodeLog(log: any, eventAbi: any): any {
    try {
      const i = new ethers.Interface([eventAbi]);
      return i.decodeEventLog(eventAbi, log.data, log.topics);
    } catch {
      return null;
    }
  }

  private async fetchEventLogs(eventAbi: any, target: string) {
    return this.options.getLogs({
      eventAbi,
      target,
    });
  }

  private validateNumber(value: any): number {
    if (value === undefined || value === null) return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }
}
