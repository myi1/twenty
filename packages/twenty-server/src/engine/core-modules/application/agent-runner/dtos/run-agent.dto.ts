import { IsNotEmpty, IsString } from 'class-validator';

export class RunAgentDto {
  @IsString()
  @IsNotEmpty()
  agentUniversalIdentifier: string;

  @IsString()
  @IsNotEmpty()
  prompt: string;
}
