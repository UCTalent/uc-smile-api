import type { GeminiMessage } from "../../db/types";

const STREAM_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${key}`;

const GENERATE_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;

const STREAM_TIMEOUT_MS = 30_000;

type GeminiCandidate = {
  content: {
    parts: [{ text: string }];
    role: string;
  };
  finishReason?: string;
};

type GeminiStreamChunk = {
  candidates?: GeminiCandidate[];
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

/**
 * Streams a response from Gemini using Server-Sent Events (SSE).
 *
 * Parses the SSE stream line by line, extracts text parts from each chunk,
 * and yields them as they arrive. Handles [DONE] terminator.
 *
 * @param messages - Gemini-format message array (system injected in first user turn)
 * @yields Text tokens as they stream from the API
 */
export async function* generateStreamResponse(
  messages: GeminiMessage[],
): AsyncGenerator<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(STREAM_URL(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: messages,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    const body = await response.text();
    throw new Error(`Gemini streaming API error ${response.status}: ${body}`);
  }

  const body = response.body;
  if (!body) {
    clearTimeout(timeoutId);
    throw new Error("Gemini API returned empty response body");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();

        if (jsonStr === "[DONE]") {
          return;
        }

        if (!jsonStr) continue;

        try {
          const chunk = JSON.parse(jsonStr) as GeminiStreamChunk;
          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield text;
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    // Process any remaining buffer content
    if (buffer.trim().startsWith("data:")) {
      const jsonStr = buffer.trim().slice(5).trim();
      if (jsonStr && jsonStr !== "[DONE]") {
        try {
          const chunk = JSON.parse(jsonStr) as GeminiStreamChunk;
          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield text;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
    reader.releaseLock();
  }
}

/**
 * Non-streaming Gemini response for testing and admin use.
 *
 * @param messages - Gemini-format message array
 * @returns Full response text as a single string
 */
export async function generateResponse(messages: GeminiMessage[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(GENERATE_URL(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: messages,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini API returned no text content");
  }

  return text;
}
