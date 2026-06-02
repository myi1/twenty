import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApplicationAgentRunnerController } from 'src/engine/core-modules/application/agent-runner/application-agent-runner.controller';
import { ApplicationAgentRunService } from 'src/engine/core-modules/application/agent-runner/services/application-agent-run.service';
import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { AiAgentExecutionModule } from 'src/engine/metadata-modules/ai/ai-agent-execution/ai-agent-execution.module';
import { AgentEntity } from 'src/engine/metadata-modules/ai/ai-agent/entities/agent.entity';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

// Mirrors ApplicationConnectionsModule: TokenModule + WorkspaceCacheStorageModule
// supply the controller's JwtAuthGuard; AiAgentExecutionModule supplies the
// AgentAsyncExecutorService that actually runs the agent. TypeOrmModule.forFeature
// is required by provideWorkspaceScopedRepository to inject the base repository.
@Module({
  imports: [
    TokenModule,
    WorkspaceCacheStorageModule,
    AiAgentExecutionModule,
    TypeOrmModule.forFeature([AgentEntity]),
  ],
  providers: [
    ApplicationAgentRunService,
    provideWorkspaceScopedRepository(AgentEntity),
  ],
  controllers: [ApplicationAgentRunnerController],
  exports: [ApplicationAgentRunService],
})
export class ApplicationAgentRunnerModule {}
