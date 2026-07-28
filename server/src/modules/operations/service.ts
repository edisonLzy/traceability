export interface ProcessingFailureQuery {
  listFailures(limit?: number): Promise<unknown[]>;
}

export class OperationsService {
  public constructor(private readonly failures: ProcessingFailureQuery) {}

  listProcessingFailures() {
    return this.failures.listFailures(100);
  }
}
