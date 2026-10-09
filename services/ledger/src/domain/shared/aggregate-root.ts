export abstract class AggregateRoot<TEvent> {
  private readonly domainEvents: TEvent[] = [];

  protected addDomainEvent(event: TEvent): void {
    this.domainEvents.push(event);
  }

  pullDomainEvents(): readonly TEvent[] {
    return this.domainEvents.splice(0);
  }
}
