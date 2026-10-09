export interface HealthIndicator {
  readonly name: string;
  readonly critical?: boolean;
  isHealthy(): Promise<boolean>;
}
