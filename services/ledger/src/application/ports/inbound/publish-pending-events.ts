export interface RejectedPublication {
  readonly id: string;
  readonly type: string;
  readonly reason: string;
  readonly attempts: number;
}

export interface PublicationReport {
  readonly published: number;
  readonly rejected: readonly RejectedPublication[];
}

export interface PublishPendingEvents {
  execute(): Promise<PublicationReport>;
}
