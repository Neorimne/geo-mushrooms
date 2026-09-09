import { Injectable } from '@nestjs/common';
import { Area } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Area[]> {
    return this.prisma.area.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: number): Promise<Area | null> {
    return this.prisma.area.findUnique({ where: { id } });
  }

  /** Idempotent: reuses the area if the name is already taken. */
  async findOrCreateByName(name: string): Promise<Area> {
    return this.prisma.area.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}
