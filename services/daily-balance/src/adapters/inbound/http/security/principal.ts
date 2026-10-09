export interface Principal {
  readonly subject: string;
  readonly merchantId: string;
  readonly scopes: ReadonlySet<string>;
}
