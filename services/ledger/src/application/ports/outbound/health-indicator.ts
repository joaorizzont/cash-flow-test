export interface HealthIndicator {
  readonly name: string;
  isHealthy(): Promise<boolean>;
}
