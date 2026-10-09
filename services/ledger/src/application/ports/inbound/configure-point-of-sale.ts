export interface ConfigurePointOfSaleCommand {
  readonly merchantId: string;
  readonly pointOfSaleId: string;
  readonly timeZone: string;
}

export interface PointOfSaleView {
  readonly id: string;
  readonly merchantId: string;
  readonly timeZone: string;
}

export interface ConfigurePointOfSale {
  execute(command: ConfigurePointOfSaleCommand): Promise<PointOfSaleView>;
}
