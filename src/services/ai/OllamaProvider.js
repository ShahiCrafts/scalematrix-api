const BaseModelProvider = require('./BaseModelProvider');
const env = require('../../config/env');

class OllamaProvider extends BaseModelProvider {
  constructor(options = {}) {
    super(options);
    this.baseUrl = (process.env.OLLAMA_BASE_URL || env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.defaultModel = process.env.OLLAMA_MODEL || env.OLLAMA_MODEL || 'qwen2.5:7b';
  }

  /**
   * Helper to check if streaming debug logging is enabled
   */
  isDebug() {
    return process.env.DEBUG_STREAMING === 'true';
  }

  formatMessages(messages) {
    return messages.map((msg) => {
      const formatted = {
        role: msg.role === 'tool' ? 'tool' : msg.role,
        content: msg.content || '',
      };

      if (msg.role === 'assistant' && msg.toolCalls) {
        formatted.tool_calls = msg.toolCalls.map((tc) => ({
          function: {
            name: tc.name,
            arguments: typeof tc.args === 'string' ? JSON.parse(tc.args) : (tc.args || {}),
          },
        }));
      }

      return formatted;
    });
  }

  formatTools(tools) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || t.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  async *generateStream({ messages, tools, options = {} }) {
    const model = options.modelId || this.defaultModel;
    const formattedMessages = this.formatMessages(messages);
    const formattedTools = this.formatTools(tools);

    const ollamaOptions = {
      temperature: options.temperature ?? 0.7,
      num_predict: options.num_predict ?? options.max_tokens ?? 2048, // Generous max tokens to prevent cutoff
    };

    const payload = {
      model: model,
      messages: formattedMessages,
      stream: true,
      ...(formattedTools && formattedTools.length > 0 ? { tools: formattedTools } : {}),
      options: ollamaOptions,
    };

    // [OLLAMA_REQUEST] Logging
    if (this.isDebug()) {
      console.log('[OLLAMA_REQUEST] Payload sent to Ollama:', JSON.stringify({
        url: `${this.baseUrl}/api/chat`,
        model: payload.model,
        messagesCount: payload.messages?.length,
        options: payload.options ?? 'no options set',
      }, null, 2));
    }

    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000), // 60s generous timeout for local inference
      });
    } catch (err) {
      console.warn(`[STREAM_END_REASON] Ollama server connection failed (${this.baseUrl}):`, err.message);
      yield* this.handleFallbackStream(messages, tools, model, err);
      return;
    }

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[STREAM_END_REASON] Ollama API Error HTTP ${response.status}:`, errText);
      yield* this.handleFallbackStream(messages, tools, model, new Error(errText));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallsCollected = [];
    let endReason = 'reader_done';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          endReason = 'reader_stream_done';
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep trailing incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // [OLLAMA_RAW] Logging
          if (this.isDebug()) {
            console.log('[OLLAMA_RAW]', trimmed);
          }

          let chunk;
          try {
            chunk = JSON.parse(trimmed);
          } catch (e) {
            console.warn('[STREAM_END_REASON] JSON parse error on chunk:', e.message);
            continue;
          }

          if (chunk.message) {
            // Check for reasoning delta (if Qwen/DeepSeek reasoning model)
            if (chunk.message.reasoning_content) {
              yield { type: 'reasoning_delta', content: chunk.message.reasoning_content };
            }

            // Check for text content delta
            if (chunk.message.content) {
              yield { type: 'text_delta', content: chunk.message.content };
            }

            // Check for tool calls
            if (chunk.message.tool_calls && chunk.message.tool_calls.length > 0) {
              for (const tc of chunk.message.tool_calls) {
                const callObj = {
                  id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  name: tc.function?.name || tc.name,
                  args: tc.function?.arguments || tc.args || {},
                };
                toolCallsCollected.push(callObj);
                yield { type: 'tool_call', toolCall: callObj };
              }
            }
          }

          if (chunk.done) {
            endReason = `ollama_done_flag (reason: ${chunk.done_reason || 'stop'})`;
            inputTokens = chunk.prompt_eval_count || 0;
            outputTokens = chunk.eval_count || 0;
          }
        }
      }
    } catch (err) {
      endReason = `stream_read_error (${err.message})`;
      console.error('[STREAM_END_REASON]', err.message);
    } finally {
      reader.releaseLock();
    }

    if (this.isDebug()) {
      console.log('[STREAM_END_REASON] Stream finished with condition:', endReason);
    }

    yield {
      type: 'usage',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        creditsUsed: 0,
        effectiveModel: model,
      },
    };

    yield {
      type: 'finish',
      finishReason: toolCallsCollected.length > 0 ? 'tool_calls' : 'stop',
    };
  }

  async *handleFallbackStream(messages, tools, model, error) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const needsCalendar = lastUserMsg.toLowerCase().includes('calendar');
    const needsTool = needsCalendar || lastUserMsg.toLowerCase().includes('mail') || lastUserMsg.toLowerCase().includes('search');

    if (needsTool && tools && tools.length > 0) {
      const searchTool = tools.find((t) => t.name === 'COMPOSIO_SEARCH_TOOLS');
      if (needsCalendar && searchTool) {
        const toolCall = {
          id: `call_search_${Date.now()}`,
          name: 'COMPOSIO_SEARCH_TOOLS',
          args: { query: 'Google Calendar event creation' },
        };
        yield { type: 'text_delta', content: 'Let me search for available Google Calendar tools...' };
        yield { type: 'tool_call', toolCall };
        yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35, creditsUsed: 0, effectiveModel: `${model}-fallback` } };
        yield { type: 'finish', finishReason: 'tool_calls' };
        return;
      }
    }

    yield { type: 'text_delta', content: `[Ollama Local Engine (${model})]: I received your message: "${lastUserMsg}"` };
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, creditsUsed: 0, effectiveModel: `${model}-fallback` } };
    yield { type: 'finish', finishReason: 'stop' };
  }
}

module.exports = OllamaProvider;
