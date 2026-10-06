import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicMeetingAnalyzer } from './anthropic-meeting-analyzer.js';
import { FakeMeetingAnalyzer } from './fake-meeting-analyzer.js';
import { MEETING_ANALYZER, MeetingAnalyzer } from './meeting-analyzer.js';

@Module({
  providers: [
    {
      provide: MEETING_ANALYZER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): MeetingAnalyzer => {
        if (config.get<string>('MEETING_ANALYZER') === 'fake') {
          return new FakeMeetingAnalyzer();
        }
        return new AnthropicMeetingAnalyzer({
          apiKey: config.get<string>('ANTHROPIC_API_KEY'),
          model: config.get<string>('ANTHROPIC_MODEL'),
        });
      },
    },
  ],
  exports: [MEETING_ANALYZER],
})
export class AnalysisModule {}
