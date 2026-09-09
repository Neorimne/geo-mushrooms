import { IngestionRun } from '@prisma/client';
import { IngestionStatus, IngestionTrigger } from '../ingestion.constants';

/** The run as the client sees it — no internals beyond what the progress UI needs. */
export class IngestionRunDto {
  id!: number;
  trigger!: IngestionTrigger;
  status!: IngestionStatus;
  scopeLabel!: string | null;
  totalCities!: number;
  processed!: number;
  failed!: number;
  currentCity!: string | null;
  errorMessage!: string | null;
  startedAt!: string;
  finishedAt!: string | null;

  static from(run: IngestionRun): IngestionRunDto {
    return {
      id: run.id,
      trigger: run.trigger as IngestionTrigger,
      status: run.status as IngestionStatus,
      scopeLabel: run.scopeLabel,
      totalCities: run.totalCities,
      processed: run.processed,
      failed: run.failed,
      currentCity: run.currentCity,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    };
  }
}
