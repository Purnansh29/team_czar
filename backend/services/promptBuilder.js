// services/promptBuilder.js
//
// Every prompt is built so the model answers using ONLY the extracted page
// content plus the running conversation — this is what keeps the assistant
// "on-page" instead of answering from general knowledge.

const SYSTEM_PREAMBLE = `You are Jarvis, a calm and precise AI reading companion built into a
browser extension. You only know what is given to you below: the content of
the page the user currently has open, and the conversation so far. Never
invent facts that aren't supported by the page content. If the page doesn't
contain the answer, say so plainly instead of guessing. Keep replies
concise and speakable out loud (they will be read aloud by speech
synthesis) — avoid markdown, bullet symbols, or long lists unless the user
specifically asks for a list. If you express opinions, interpretations, or
speculations not directly stated in the text, clearly state that they are
your interpretations or opinions rather than facts from the page.`;

function formatHistory(history = []) {
  if (!history.length) return "(no prior conversation on this page yet)";
  return history
    .slice(-10) // keep the prompt bounded — last 10 turns is plenty of context
    .map((turn) => `${turn.role === "user" ? "User" : "Jarvis"}: ${turn.content}`)
    .join("\n");
}

function pageBlock(page) {
  // llama3.2:1b has a 128k context window; 8000 chars gives great coverage
  // while keeping inference fast on most hardware.
  const trimmedText = (page?.textContent || "").slice(0, 8000);
  return `Page title: ${page?.title || "(untitled)"}
Page URL: ${page?.url || "(unknown)"}
Site: ${page?.siteName || "(unknown)"}
Word count: ~${page?.wordCount || "unknown"}
Page text:
"""
${trimmedText}
"""`;
}

export function buildPrompt({ command, message, page, history, target }) {
  const historyBlock = formatHistory(history);
  const pageInfo = pageBlock(page);

  let instruction;
  switch (command) {
    case "summarize":
      instruction = "Summarize this page in 3-5 concise sentences.";
      break;

    case "explain_article":
      instruction =
        "Explain what this article/page is about and its main argument or purpose, in plain language.";
      break;

    case "explain_paragraph": {
      const idx = target?.paragraphIndex ?? 0;
      const paragraph = page?.paragraphs?.[idx] || "(paragraph not found)";
      instruction = `Explain the following paragraph from the page in simple terms:\n"""${paragraph}"""`;
      break;
    }

    case "what_does_this_mean": {
      const idx = target?.paragraphIndex ?? 0;
      const paragraph = page?.paragraphs?.[idx] || "(paragraph not found)";
      instruction = `The user is currently on this paragraph and asked "what does this mean?":\n"""${paragraph}"""\nExplain it clearly.`;
      break;
    }

    case "explain_code": {
      const block = page?.codeBlocks?.find((b) => b.id === target?.codeId) || page?.codeBlocks?.[0];
      instruction = block
        ? `Explain the following ${block.language} code block: what it does, step by step, and why it might be written this way.\n"""${block.code}"""`
        : "The user asked to explain a code block, but none was found on this page. Say so.";
      break;
    }

    case "important_points":
      instruction = "List the most important points from this page as short spoken sentences (not more than 5).";
      break;

    case "explain_selection":
      instruction = `Explain the following text the user selected on the page:\n"""${target?.selectionText || message}"""`;
      break;

    case "summarize_selection":
      instruction = `Summarize the following text the user selected on the page in 1-2 sentences:\n"""${target?.selectionText || message}"""`;
      break;

    case "chat":
    default:
      instruction = `Answer the user's question about the page: "${message}"`;
      break;
  }

  return `${SYSTEM_PREAMBLE}

${pageInfo}

Conversation so far:
${historyBlock}

Current instruction: ${instruction}`;
}

export function buildTranslationPrompt({ text, targetLanguage }) {
  return `Translate the following text to ${targetLanguage || "English"}. Return only the
translation, nothing else.

"""${text}"""`;
}
