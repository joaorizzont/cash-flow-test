import { DomainError } from '../../domain/index.js';

export class PointOfSaleNotFoundError extends DomainError {
  readonly code = 'POINT_OF_SALE_NOT_FOUND';

  constructor(pointOfSaleId: string) {
    super(`Point of sale ${pointOfSaleId} was not found`);
  }
}
