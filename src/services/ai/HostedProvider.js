const BaseModelProvider = require('./BaseModelProvider');
const env = require('../../config/env');

class HostedProvider extends BaseModelProvider {
  constructor(options = {}) {
    super(options);
    this.apiKey = env.HOSTED_AI_API_KEY || process.env.OPENAI_API_KEY || '';
  }

  async *generateStream({ messages, tools, options = {} }) {
    const model = options.modelId || 'gpt-4o-mini';
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';

    // Check if tools exist and query hints tool usage
    const isCalendarReq = lastUserMsg.toLowerCase().includes('calendar');
    if (isCalendarReq && tools && tools.length > 0) {
      const searchTool = tools.find((t) => t.name === 'COMPOSIO_SEARCH_TOOLS');
      if (searchTool) {
        yield { type: 'text_delta', content: 'Searching available tools for calendar integration...' };
        yield {
          type: 'tool_call',
          toolCall: {
            id: `call_hosted_${Date.now()}`,
            name: 'COMPOSIO_SEARCH_TOOLS',
            args: { query: 'Google Calendar' },
          },
        };
        yield {
          type: 'usage',
          usage: {
            inputTokens: 50,
            outputTokens: 25,
            totalTokens: 75,
            creditsUsed: 0.005, // Metered hosted model usage
            effectiveModel: model,
          },
        };
        yield { type: 'finish', finishReason: 'tool_calls' };
        return;
      }
    }

    // Default hosted response stream
    yield { type: 'text_delta', content: `[Hosted Gateway (${model})]: ` };
    yield { type: 'text_delta', content: `Received prompt: "${lastUserMsg}". ScaleMatrix AI Assistant ready.` };

    yield {
      type: 'usage',
      usage: {
        inputTokens: 40,
        outputTokens: 30,
        totalTokens: 70,
        creditsUsed: 0.004,
        effectiveModel: model,
      },
    };
    yield { type: 'finish', finishReason: 'stop' };
  }
}

module.exports = HostedProvider;
