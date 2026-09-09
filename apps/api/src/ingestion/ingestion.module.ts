import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { ARCHIVE_PROVIDER } from './archive-provider';
import { SyntheticArchiveProvider } from './sources/synthetic/synthetic.provider';

// Reads cities straight from Prisma rather than importing CitiesModule — that
// keeps the dependency one-way (cities -> ingestion) and the graph acyclic.
@Module({
  controllers: [IngestionController],
  // The adapter is named in exactly one place. Pointing this line at a
  // network-backed provider is the whole of what it takes to read a real
  // archive instead of a generated one.
  providers: [
    IngestionService,
    { provide: ARCHIVE_PROVIDER, useClass: SyntheticArchiveProvider },
  ],
  // CitiesModule validates a new slug against the archive before persisting it.
  exports: [IngestionService, ARCHIVE_PROVIDER],
})
export class IngestionModule {}
