import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FakeMeetingAnalyzer } from '../src/analysis/fake-meeting-analyzer.js';
import { MEETING_ANALYZER } from '../src/analysis/meeting-analyzer.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  analyzer: FakeMeetingAnalyzer;
  http: () => ReturnType<typeof request>;
}

/**
 * Boots the real application against the test database, with the analyzer
 * replaced by a FakeMeetingAnalyzer so no test can reach the Anthropic API.
 */
export async function createTestApp(): Promise<TestApp> {
  const analyzer = new FakeMeetingAnalyzer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MEETING_ANALYZER)
    .useValue(analyzer)
    .compile();

  const app = moduleRef.createNestApplication();
  // Expected 5xx paths are asserted on by the tests; keep them out of the output.
  app.useLogger(false);
  configureApp(app);
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    analyzer,
    http: () => request(app.getHttpServer()),
  };
}

export async function resetState({ prisma, analyzer }: TestApp): Promise<void> {
  // Analyses and action items go with their meeting (ON DELETE CASCADE).
  await prisma.meeting.deleteMany();
  analyzer.reset();
}

export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
