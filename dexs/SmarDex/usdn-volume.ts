import { FetchOptions } from "../../adapters/types";
import { formatEther } from "ethers";
import { usdnAbi } from "./abis";
import { CONFIG } from "./config";
import { getPrices } from "../../utils/prices";

export class USDNVolumeService {
  private options: FetchOptions;

  constructor(options: FetchOptions) {
    this.options = options;
  }

  public async fetchAllVolumeLogs() {
    const { USDN, DIP_ACCUMULATOR } = CONFIG.CONTRACTS;

    return Promise.all([
      this.fetchEventLogs(usdnAbi.vaultDepositEvent, USDN),
      this.fetchEventLogs(usdnAbi.vaultWithdrawalEvent, USDN),
      this.fetchEventLogs(usdnAbi.longOpenPositionEvent, USDN),
      this.fetchEventLogs(usdnAbi.longClosePositionEvent, USDN),
      this.fetchEventLogs(usdnAbi.rebalancerDepositEvent, DIP_ACCUMULATOR),
      this.fetchEventLogs(usdnAbi.rebalancerWithdrawalEvent, DIP_ACCUMULATOR),
    ]);
  }

  public calculateVolumes(logs: any[][]) {
    const [
      vaultDepositLogs,
      vaultWithdrawalLogs,
      longOpenLogs,
      longCloseLogs,
      dipAccumulatorDepositLogs,
      dipAccumulatorWithdrawalLogs,
    ] = logs;

    return {
      usdn: {
        raw: this.sumBigIntFromLogs(
          [...vaultDepositLogs, ...vaultWithdrawalLogs],
          3
        ),
        breakdown: {
          deposits: this.sumBigIntFromLogs(vaultDepositLogs, 3),
          withdrawals: this.sumBigIntFromLogs(vaultWithdrawalLogs, 3),
        },
      },
      wsteth: {
        long: {
          raw:
            this.sumBigIntFromLogs(longOpenLogs, 4) +
            this.sumBigIntFromLogs(longCloseLogs, 3),
          breakdown: {
            open: this.sumBigIntFromLogs(longOpenLogs, 4),
            close: this.sumBigIntFromLogs(longCloseLogs, 3),
          },
        },
        dipAccumulator: {
          raw:
            this.sumBigIntFromLogs(dipAccumulatorDepositLogs, 1) +
            this.sumBigIntFromLogs(dipAccumulatorWithdrawalLogs, 2),
          breakdown: {
            deposits: this.sumBigIntFromLogs(dipAccumulatorDepositLogs, 1),
            withdrawals: this.sumBigIntFromLogs(
              dipAccumulatorWithdrawalLogs,
              2
            ),
          },
        },
      },
    };
  }

  private validateNumber(value: any): number {
    if (value === undefined || value === null) return 0;

    const num = Number(value);
    if (isNaN(num)) {
      console.warn(`Invalid number encountered: ${value} (${typeof value})`);
      return 0;
    }
    return num;
  }

  public async convertVolumesToUsd(volumes: any) {
    const { USDN, WSTETH } = CONFIG.TOKENS;
    const timestamp =
      this.options.fromTimestamp || Math.floor(Date.now() / 1000);

    const usdnApiKey = `ethereum:${USDN.toLowerCase()}`;
    const wstethApiKey = `ethereum:${WSTETH.toLowerCase()}`;

    try {
      const priceData = await getPrices([usdnApiKey, wstethApiKey], timestamp);

      const usdnPrice = this.validateNumber(priceData[usdnApiKey]?.price);
      const wstethPrice = this.validateNumber(priceData[wstethApiKey]?.price);

      const usdnVolume = this.validateNumber(
        parseFloat(formatEther(volumes.usdn.raw))
      );
      const longVolume = this.validateNumber(
        parseFloat(formatEther(volumes.wsteth.long.raw))
      );
      const dipAccumulatorVolume = this.validateNumber(
        parseFloat(formatEther(volumes.wsteth.dipAccumulator.raw))
      );

      const usdnVolumeUsd = usdnVolume * usdnPrice;
      const longVolumeUsd = longVolume * wstethPrice;
      const dipAccumulatorVolumeUsd = dipAccumulatorVolume * wstethPrice;

      const total = usdnVolumeUsd + longVolumeUsd + dipAccumulatorVolumeUsd;

      if (isNaN(total)) {
        console.error("Error: total volume is NaN. Component values:", {
          usdnVolumeUsd,
          longVolumeUsd,
          dipAccumulatorVolumeUsd,
          usdnPrice,
          wstethPrice,
        });
        return null;
      }

      return {
        usdn: usdnVolumeUsd,
        wsteth: {
          long: longVolumeUsd,
          dipAccumulator: dipAccumulatorVolumeUsd,
        },
        total,
      };
    } catch (error) {
      console.error("Error converting volumes to USD:", error);
      return null;
    }
  }

  public async getUsdnVolume(): Promise<number> {
    const logs = await this.fetchAllVolumeLogs();
    const volumes = this.calculateVolumes(logs);
    const usdVolumes = await this.convertVolumesToUsd(volumes);

    if (!usdVolumes) {
      console.error("Error converting volumes to USD");
      return 0;
    }

    return usdVolumes.total;
  }

  private async fetchEventLogs(eventAbi: any, target: string) {
    return this.options.getLogs({
      eventAbi,
      target,
    });
  }

  private sumBigIntFromLogs(logs: any[], valueIndex: number): bigint {
    return logs.reduce((acc, log) => acc + BigInt(log[valueIndex]), 0n);
  }
}
