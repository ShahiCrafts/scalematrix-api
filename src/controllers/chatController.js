const crypto = require('crypto');
const Thread = require('../models/Thread');
const ModelProviderFactory = require('../services/ai/ModelProviderFactory');
const ComposioAgentTools = require('../services/ai/ComposioAgentTools');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Utility to write SSE formatted data to response
 */
function sendSSE(res, eventType, data = {}) {
  const jsonStr = JSON.stringify(data);
  if (process.env.DEBUG_STREAMING === 'true') {
    console.log(`[SSE_EMIT] event=${eventType} payloadLength=${jsonStr.length}`);
  }
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${jsonStr}\n\n`);
}

/**
 * Handle streaming chat completions with ReAct Agent Loop (POST /api/chat)
 */
const handleChatStream = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { modelId, threadId, messages = [] } = req.body;

  // 1. Thread Authorization & Scoping
  let thread;
  if (threadId) {
    thread = await Thread.findOne({ _id: threadId, userId });
    if (!thread) {
      throw ApiError.forbidden('Unauthorized thread access or thread does not exist.');
    }
  } else {
    thread = await Thread.create({
      userId,
      title: 'New Chat',
      titleSource: 'auto',
      messages: [],
    });
  }

  // 2. Setup Server-Sent Events (SSE) Response Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const currentStepId = `step_${Date.now()}`;
  const assistantMsgId = crypto.randomUUID();

  // Send SSE start events
  sendSSE(res, 'start', { threadId: thread._id });
  sendSSE(res, 'start-step', { stepId: currentStepId });

  // 3. Prepare AI Model Provider & Tools
  const provider = ModelProviderFactory.getProvider(modelId);
  const tools = ComposioAgentTools.getToolDefinitions();

  // Combine saved thread messages with request messages
  const fullMessages = messages.length > 0 ? messages : (thread.messages || []);

  // Bug 2 Fix: Inject exact current server date/time into System Prompt on every turn
  const currentDateISO = new Date().toISOString();
  const currentDateStr = new Date().toString();
  const systemPromptContent = `You are ScaleMatrix AI Strategy Advisor, a tool-calling AI agent.
Today's exact server date and time is: ${currentDateISO} (${currentDateStr}).
CRITICAL INSTRUCTION FOR DATES:
Always resolve all relative date references (such as "today", "tomorrow", "yesterday", "next week", "next Monday", etc.) strictly against today's date ${currentDateISO}. Never hallucinate past or arbitrary dates (such as 2023).

ScaleMatrix Authorized Apps: Gmail, Google Calendar, Google Meet, LinkedIn, Instagram, Facebook, Notion, Google Sheets, Discord, Trello.

DIRECT ACTION INSTRUCTION:
1. When asked to perform an action (e.g. create a calendar event, send an email, create a page), invoke COMPOSIO_MULTI_EXECUTE_TOOL directly with actionKey (e.g. "googlecalendar.createEvent" or "GOOGLECALENDAR_CREATE_EVENT") and parameters.
2. Only call COMPOSIO_MANAGE_CONNECTIONS if an execution fails because an account is not connected.
3. When COMPOSIO_MANAGE_CONNECTIONS returns status "already_connected", IMMEDIATELY call COMPOSIO_MULTI_EXECUTE_TOOL in the same turn to perform the user's action.`;

  let workingMessages = [...fullMessages];
  const sysIdx = workingMessages.findIndex((m) => m.role === 'system');
  if (sysIdx >= 0) {
    workingMessages[sysIdx] = { role: 'system', content: systemPromptContent };
  } else {
    workingMessages.unshift({ role: 'system', content: systemPromptContent });
  }

  let accumulatedContent = '';
  let accumulatedReasoning = '';
  let accumulatedToolCalls = [];
  let usageStats = { inputTokens: 0, outputTokens: 0, totalTokens: 0, creditsUsed: 0, effectiveModel: modelId || 'qwen2.5:7b' };
  let partsList = [];

  let isReasoningActive = false;
  let isTextActive = false;

  // Bug 1 Fix: ReAct Feedback Loop (Max 5 Iterations)
  let loopCount = 0;
  const MAX_ITERATIONS = 5;

  try {
    while (loopCount < MAX_ITERATIONS) {
      loopCount++;
      let hasNewToolCallInIteration = false;
      let executedToolResultsInIteration = [];

      const stream = provider.generateStream({
        messages: workingMessages,
        tools,
        options: { modelId },
      });

      for await (const chunk of stream) {
        if (chunk.type === 'reasoning_delta') {
          if (!isReasoningActive) {
            sendSSE(res, 'reasoning-start', { stepId: currentStepId });
            isReasoningActive = true;
          }
          accumulatedReasoning += chunk.content;
          sendSSE(res, 'reasoning-delta', { delta: chunk.content });
        } else if (chunk.type === 'text_delta') {
          if (isReasoningActive) {
            sendSSE(res, 'reasoning-end', { stepId: currentStepId });
            isReasoningActive = false;
          }
          if (!isTextActive) {
            sendSSE(res, 'text-start', { stepId: currentStepId });
            isTextActive = true;
          }
          accumulatedContent += chunk.content;
          sendSSE(res, 'text-delta', { delta: chunk.content });
        } else if (chunk.type === 'tool_call') {
          hasNewToolCallInIteration = true;
          if (isTextActive) {
            sendSSE(res, 'text-end', { stepId: currentStepId });
            isTextActive = false;
          }

          const tc = chunk.toolCall;
          accumulatedToolCalls.push(tc);

          sendSSE(res, 'tool-input-start', { toolCallId: tc.id, toolName: tc.name });
          sendSSE(res, 'tool-input-delta', { toolCallId: tc.id, args: tc.args });
          sendSSE(res, 'tool-input-available', { toolCallId: tc.id, toolName: tc.name, args: tc.args });

          // Execute Meta Tool via ComposioAgentTools
          const toolResult = await ComposioAgentTools.executeMetaTool(tc.name, tc.args, {
            userId,
            workspaceId: req.user.currentWorkspaceId || userId,
          });

          sendSSE(res, 'tool-output-available', {
            toolCallId: tc.id,
            toolName: tc.name,
            result: toolResult,
          });

          partsList.push({
            type: 'tool-call',
            toolCall: { id: tc.id, name: tc.name, args: tc.args },
          });

          partsList.push({
            type: 'tool-result',
            toolResult: { toolCallId: tc.id, name: tc.name, output: toolResult },
          });

          executedToolResultsInIteration.push({ tc, toolResult });
        } else if (chunk.type === 'usage') {
          usageStats = chunk.usage;
        }
      }

      // If tool calls were emitted in this iteration:
      if (hasNewToolCallInIteration && executedToolResultsInIteration.length > 0) {
        // Check if any tool result requires user OAuth/connection link
        const needsUserAuth = executedToolResultsInIteration.some((e) =>
          e.toolResult?.requiresUserAuth && e.toolResult?.results?.some((r) => r.status === 'connection_initiated' || r.redirectUrl)
        );

        if (needsUserAuth) {
          console.log(`[AGENT_LOOP_STOP] Stopping agent loop to wait for user OAuth connection completion.`);
          break;
        }

        workingMessages.push({
          role: 'assistant',
          content: accumulatedContent || '',
          toolCalls: executedToolResultsInIteration.map((e) => e.tc),
        });

        for (const { tc, toolResult } of executedToolResultsInIteration) {
          workingMessages.push({
            role: 'tool',
            toolCallId: tc.id,
            name: tc.name,
            content: JSON.stringify(toolResult),
          });
        }

        // Re-invoke model with updated context
        continue;
      }

      // If no new tool calls were emitted, agent loop is complete
      break;
    }

    if (isReasoningActive) {
      sendSSE(res, 'reasoning-end', { stepId: currentStepId });
      isReasoningActive = false;
    }

    // Ensure non-empty assistant response text
    if (!accumulatedContent.trim()) {
      const fallbackText = accumulatedToolCalls.length > 0
        ? `Your request has been processed successfully.`
        : `Request processing complete.`;

      accumulatedContent = fallbackText;
      if (!isTextActive) {
        sendSSE(res, 'text-start', { stepId: currentStepId });
        isTextActive = true;
      }
      sendSSE(res, 'text-delta', { delta: fallbackText });
    }

    if (isTextActive) {
      sendSSE(res, 'text-end', { stepId: currentStepId });
      isTextActive = false;
    }

    // Prepare message parts
    if (accumulatedReasoning) {
      partsList.unshift({ type: 'reasoning', reasoning: accumulatedReasoning });
    }
    if (accumulatedContent) {
      partsList.push({ type: 'text', text: accumulatedContent });
    }

    // 4. Save User Message & Assistant Message to Thread Document
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === 'user') {
      const userMsgExists = thread.messages.some((m) => m.id === lastUserMsg.id);
      if (!userMsgExists) {
        thread.messages.push({
          id: lastUserMsg.id || crypto.randomUUID(),
          role: 'user',
          content: lastUserMsg.content,
          parts: [{ type: 'text', text: lastUserMsg.content }],
          createdAt: new Date(),
        });
      }
    }

    const assistantMsg = {
      id: assistantMsgId,
      role: 'assistant',
      content: accumulatedContent,
      parts: partsList,
      metadata: {
        inputTokens: usageStats.inputTokens || 0,
        outputTokens: usageStats.outputTokens || 0,
        totalTokens: usageStats.totalTokens || 0,
        creditsUsed: usageStats.creditsUsed || 0,
        requestedModel: modelId || 'qwen2.5:7b',
        effectiveModel: usageStats.effectiveModel || modelId || 'qwen2.5:7b',
      },
      createdAt: new Date(),
    };

    thread.messages.push(assistantMsg);
    await thread.save();

    // Finish step and stream completion
    sendSSE(res, 'finish-step', { stepId: currentStepId });
    sendSSE(res, 'finish', { threadId: thread._id, messageId: assistantMsgId });

    res.end();
  } catch (err) {
    console.error('❌ Error during chat stream:', err);
    sendSSE(res, 'error', { message: err.message || 'Stream processing error' });
    res.end();
  }
});

/**
 * Generate thread title auto-summarizer (POST /api/chat/title)
 */
const generateThreadTitle = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { threadId, prompt } = req.body;

  if (!threadId) {
    throw ApiError.badRequest('threadId is required.');
  }

  const thread = await Thread.findOne({ _id: threadId, userId });
  if (!thread) {
    throw ApiError.forbidden('Unauthorized thread access or thread does not exist.');
  }

  const textToSummarize = prompt || thread.messages[0]?.content || 'Chat Session';
  
  let generatedTitle = textToSummarize
    .replace(/^["']|["']$/g, '')
    .trim()
    .slice(0, 40);

  if (generatedTitle.length === 40) {
    generatedTitle += '...';
  }

  thread.title = generatedTitle;
  thread.titleSource = 'auto';
  await thread.save();

  res.status(200).json({
    success: true,
    data: {
      threadId: thread._id,
      title: thread.title,
    },
  });
});

module.exports = {
  handleChatStream,
  generateThreadTitle,
};