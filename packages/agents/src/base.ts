import OpenAI from 'openai';
import { createChildLogger } from '@returnclaw/core';
import type {
  AgentType,
  AgentContext,
  AgentMessage,
  AgentResult,
  Tool,
  Logger,
} from '@returnclaw/core';

export abstract class BaseAgent {
  abstract readonly type: AgentType;
  abstract readonly description: string;

  protected openai: OpenAI;
  protected log: Logger;
  private defaultModel: string;
  private fastModel: string;

  constructor() {
    this.openai = new OpenAI();
    this.defaultModel = process.env['OPENAI_MODEL'] ?? 'gpt-4o';
    this.fastModel = process.env['OPENAI_MODEL_FAST'] ?? 'gpt-4o-mini';
    this.log = createChildLogger({ agent: 'agent' });
  }

  abstract process(input: AgentMessage, context: AgentContext): Promise<AgentResult>;

  protected async callLLM(
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
    systemPrompt: string,
    options: {
      tools?: Tool[];
      useFastModel?: boolean;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<string> {
    const { useFastModel = false, temperature = 0.3, maxTokens = 2000 } = options;
    const model = useFastModel ? this.fastModel : this.defaultModel;

    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ];

    const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined =
      options.tools?.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as unknown as Record<string, unknown>,
        },
      }));

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model,
          messages: openaiMessages,
          tools: openaiTools,
          temperature,
          max_tokens: maxTokens,
        });

        const choice = response.choices[0];
        if (!choice) {
          throw new Error('No response from LLM');
        }

        // Handle tool calls
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0 && options.tools) {
          const toolResults: string[] = [];

          for (const toolCall of choice.message.tool_calls) {
            const tool = options.tools.find((t) => t.name === toolCall.function.name);
            if (tool) {
              try {
                const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
                const result = await tool.execute(args, {} as AgentContext);
                toolResults.push(JSON.stringify(result));
              } catch (err) {
                this.log.error({ err, tool: toolCall.function.name }, 'Tool execution failed');
                toolResults.push(JSON.stringify({ error: String(err) }));
              }
            }
          }

          // Make a follow-up call with tool results
          const followUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            ...openaiMessages,
            choice.message as OpenAI.Chat.Completions.ChatCompletionMessageParam,
            ...choice.message.tool_calls.map((tc, i) => ({
              role: 'tool' as const,
              tool_call_id: tc.id,
              content: toolResults[i] ?? '',
            })),
          ];

          const followUp = await this.openai.chat.completions.create({
            model,
            messages: followUpMessages,
            temperature,
            max_tokens: maxTokens,
          });

          return followUp.choices[0]?.message?.content ?? '';
        }

        return choice.message.content ?? '';
      } catch (err) {
        if (attempt === maxRetries) {
          this.log.error({ err, model, attempt }, 'LLM call failed after retries');
          throw err;
        }
        this.log.warn({ err, model, attempt }, 'LLM call failed, retrying');
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error('LLM call failed unexpectedly');
  }

  protected logAction(
    action: string,
    data?: Record<string, unknown>,
  ): void {
    this.log.info({ agent: this.type, action, ...data }, `Agent action: ${action}`);
  }
}
