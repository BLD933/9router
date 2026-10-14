/**
 * Helpers for the OpenCode Zen free-tier client fingerprint.
 *
 * Live upstream probes show that free-tier requests must include the lowercase
 * file-search quartet (bash/glob/grep/read). Agent clients such as Claude Code
 * may declare the same tools with different casing, so those case variants must
 * be renamed instead of duplicated. The response side restores the caller's
 * original spelling so downstream clients still recognise their own tool calls.
 */

export const OPENCODE_STANDARD_TOOLS = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.\n\nBe aware: OS: linux, Shell: zsh\n\nAll commands run in the current working directory by default. Use the `workdir` parameter if you need to run a command in a different directory. AVOID using `cd <directory> && <command>` patterns - use `workdir` instead.\n\nUse `/tmp/opencode` for temporary work outside the workspace. This directory has already been created, already exists, and is pre-approved for external directory access.\n\nIMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.\n\nBefore executing the command, please follow these steps:\n\n1. Directory Verification:\n   - If the command will create new directories or files, first use `ls` to verify the parent directory exists and is the correct location\n   - For example, before running \"mkdir foo/bar\", first use `ls foo` to check that \"foo\" exists and is the intended parent directory\n\n2. Command Execution:\n   - Always quote file paths that contain spaces with double quotes (e.g., rm \"path with spaces/file.txt\")\n   - Examples of proper quoting:\n     - mkdir \"/Users/name/My Documents\" (correct)\n     - mkdir /Users/name/My Documents (incorrect - will fail)\n     - python \"/path/with spaces/script.py\" (correct)\n     - python /path/with spaces/script.py (incorrect - will fail)\n   - After ensuring proper quoting, execute the command.\n   - Capture the output of the command.\n\nUsage notes:\n  - The command argument is required.\n  - You can specify an optional timeout in milliseconds. If not specified, commands will time out after 120000ms.\n  - If the output exceeds 2000 lines or 51200 bytes, it will be truncated and the full output will be written to a file. You can use Read with offset/limit to read specific sections or Grep to search the full content. Do NOT use `head`, `tail`, or other truncation commands to limit output; the full output will already be captured to a file for more precise searching.\n\n  - Avoid using Bash with the `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo` commands, unless explicitly instructed or when these commands are truly necessary for the task. Instead, always prefer using the dedicated tools for these commands:\n    - File search: Use Glob (NOT find or ls)\n    - Content search: Use Grep (NOT grep or rg)\n    - Read files: Use Read (NOT cat/head/tail)\n    - Edit files: Use Edit (NOT sed/awk)\n    - Write files: Use Write (NOT echo >/cat <<EOF)\n    - Communication: Output text directly (NOT echo/printf)\n  - When issuing multiple commands:\n    - If the commands are independent and can run in parallel, make multiple bash tool calls in a single message. For example, if you need to run \"git status\" and \"git diff\", send a single message with two bash tool calls in parallel.\n    - If the commands depend on each other and must run sequentially, use a single Bash call with '&&' to chain them together (e.g., `git add . && git commit -m \"message\" && git push`). For instance, if one operation must complete before another starts (like mkdir before cp, Write before Bash for git operations, or git add before git commit), run these operations sequentially instead.\n    - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail\n    - DO NOT use newlines to separate commands (newlines are ok in quoted strings)\n  - AVOID using `cd <directory> && <command>`. Use the `workdir` parameter to change directories instead.\n    <good-example>\n    Use workdir=\"/foo/bar\" with command: pytest tests\n    </good-example>\n    <bad-example>\n    cd /foo/bar && pytest tests\n    </bad-example>\n\n# Git and GitHub\n- Only commit, amend, push, or create PRs when explicitly requested.\n- Before committing, inspect `git status`, `git diff`, and `git log --oneline -10`; stage only intended files and never commit secrets.\n- Write a concise commit message that matches the repo style.\n- Do not update git config, skip hooks, use interactive `-i`, force-push, or create empty commits unless explicitly requested.\n- If a commit fails or hooks reject it, fix the issue and create a new commit; do not amend the failed commit.\n- Before creating a PR, inspect status, diff, remote tracking, recent commits, and the diff from the base branch.\n- Review all commits included in the PR, not just the latest commit.\n- Use `gh` for GitHub tasks, including PRs, issues, checks, and releases; return the PR URL when done.\n",
      parameters: {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The command to execute"
          },
          timeout: {
            minimum: -9007199254740991,
            exclusiveMinimum: 0,
            type: "integer",
            maximum: 9007199254740991,
            description: "Optional timeout in milliseconds"
          },
          workdir: {
            type: "string",
            description: "The working directory to run the command in. Defaults to the current directory. Use this instead of 'cd' commands."
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit",
      description: "Performs exact string replacements in files. \n\nUsage:\n- You must use your `Read` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. \n- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: line number + colon + space (e.g., `1: `). Everything after that space is the actual file content to match. Never include any part of the line number prefix in the oldString or newString.\n- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.\n- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.\n- The edit will FAIL if `oldString` is not found in the file with an error \"oldString not found in content\".\n- The edit will FAIL if `oldString` is found multiple times in the file with an error \"Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.\" Either provide a larger string with more surrounding context to make it unique or use `replaceAll` to change every instance of `oldString`. \n- Use `replaceAll` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.\n",
      parameters: {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "The absolute path to the file to modify"
          },
          oldString: {
            type: "string",
            description: "The text to replace"
          },
          newString: {
            type: "string",
            description: "The text to replace it with (must be different from oldString)"
          },
          replaceAll: {
            type: "boolean",
            description: "Replace all occurrences of oldString (default false)"
          }
        },
        required: ["filePath", "oldString", "newString"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read",
      description: "Read a file or directory from the local filesystem. If the path does not exist, an error is returned.\n\nUsage:\n- The filePath parameter should be an absolute path.\n- By default, this tool returns up to 2000 lines from the start of the file.\n- The offset parameter is the line number to start from (1-indexed).\n- To read later sections, call this tool again with a larger offset.\n- Use the grep tool to find specific content in large files or files with long lines.\n- If you are unsure of the correct file path, use the glob tool to look up filenames by glob pattern.\n- Contents are returned with each line prefixed by its line number as `<line>: <content>`. For example, if a file has contents \"foo\\n\", you will receive \"1: foo\\n\". For directories, entries are returned one per line (without line numbers) with a trailing `/` for subdirectories.\n- Any line longer than 2000 characters is truncated.\n- Call this tool in parallel when you know there are multiple files you want to read.\n- Avoid tiny repeated slices (30 line chunks). If you need more context, read a larger window.\n- This tool can read image files and PDFs and return them as file attachments.\n",
      parameters: {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "The absolute path to the file or directory to read"
          },
          offset: {
            minimum: 0,
            type: "integer",
            maximum: 9007199254740991,
            description: "The line number to start reading from (1-indexed)"
          },
          limit: {
            minimum: 0,
            type: "integer",
            maximum: 9007199254740991,
            description: "The maximum number of lines to read (defaults to 2000)"
          }
        },
        required: ["filePath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write",
      description: "Writes a file to the local filesystem.\n\nUsage:\n- This tool will overwrite the existing file if there is one at the provided path.\n- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.\n- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.\n- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.\n- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.\n",
      parameters: {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The content to write to the file"
          },
          filePath: {
            type: "string",
            description: "The absolute path to the file to write (must be absolute, not relative)"
          }
        },
        required: ["content", "filePath"]
      }
    }
  }
];

/** Canonical names required by the upstream free-tier gate. */
export const OPENCODE_FINGERPRINT_TOOLS = ["bash", "edit", "read", "write"];

// Request body -> names renamed for that request. transformRequest() mutates the
// same body object that chatCore passed into the executor, so a WeakMap keeps the
// mapping request-local without putting transport metadata on the wire.
const renamedToolNames = new WeakMap();

/** Canonical lowercase name when `name` is a quartet member; "" otherwise. */
export function fingerprintToolKey(name) {
  const lower = String(name ?? "").trim().toLowerCase();
  return OPENCODE_FINGERPRINT_TOOLS.includes(lower) ? lower : "";
}

/** Read a tool name from either flat ({name}) or chat ({function:{name}}) shape. */
function toolNameOf(tool) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return "";
  if (typeof tool.name === "string" && tool.name.trim()) return tool.name.trim();
  const fn = tool.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn) && typeof fn.name === "string") {
    return fn.name.trim();
  }
  return "";
}

/**
 * Canonicalise only the fingerprint quartet and remove duplicate quartet
 * variants. Non-fingerprint tools are preserved verbatim, including tools whose
 * names differ only by case; they are outside OpenCode's fingerprint contract.
 *
 * @param {Array} tools
 * @returns {{ tools: Array, map: Map<string,string> }} map: sent name -> original name
 */
export function concealFingerprintToolNames(tools, flat = false) {
  const map = new Map();
  if (!Array.isArray(tools) || tools.length === 0) return { tools, map };

  const seenQuartet = new Set();
  const out = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
      out.push(tool);
      continue;
    }

    const current = toolNameOf(tool);
    const key = fingerprintToolKey(current);
    if (!key) {
      out.push(tool);
      continue;
    }

    // `Bash` + `bash` is rejected upstream as a duplicate. Keep exactly one
    // declaration for each quartet member.
    if (seenQuartet.has(key)) continue;
    seenQuartet.add(key);

    if (current !== key) {
      map.set(key, current);
    }

    // Upstream free-tier gate strictly verifies that quartet members (bash, edit, read, write)
    // match OpenCode's authentic tool description and JSON Schema parameters.
    const def = OPENCODE_STANDARD_TOOLS.find((t) => t.function.name === key);
    if (def) {
      out.push(flat ? {
        type: "function",
        name: key,
        description: def.function.description,
        parameters: def.function.parameters,
      } : {
        type: "function",
        function: {
          name: key,
          description: def.function.description,
          parameters: def.function.parameters,
        },
      });
    } else {
      out.push(tool);
    }
  }
  return { tools: out, map };
}

/** Append only genuinely missing quartet declarations. */
export function appendMissingFingerprintTools(tools, flat) {
  const list = Array.isArray(tools) ? tools : [];
  for (const def of OPENCODE_STANDARD_TOOLS) {
    const name = def.function.name;
    if (list.some((tool) => fingerprintToolKey(toolNameOf(tool)) === name)) continue;
    list.push(flat ? {
      type: "function",
      name,
      description: def.function.description,
      parameters: def.function.parameters,
    } : {
      type: "function",
      function: {
        name,
        description: def.function.description,
        parameters: def.function.parameters,
      },
    });
  }
  return list;
}

/** Point an explicit tool_choice at a quartet member after canonicalisation. */
export function retargetToolChoice(body, map) {
  if (!body || typeof body !== "object" || !map?.size) return;
  const choice = body.tool_choice;
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) return;

  if (typeof choice.name === "string") {
    const key = fingerprintToolKey(choice.name);
    if (key && map.has(key)) body.tool_choice = { ...choice, name: key };
    return;
  }

  const fn = choice.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn) && typeof fn.name === "string") {
    const key = fingerprintToolKey(fn.name);
    if (key && map.has(key)) {
      body.tool_choice = { ...choice, function: { ...fn, name: key } };
    }
  }
}

/**
 * Canonicalise tool_calls in request messages to match upstream OpenCode's
 * quartet names and parameter schema.
 */
export function canonicalizeMessageToolCalls(messages) {
  if (!Array.isArray(messages)) return;
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if (Array.isArray(msg.tool_calls)) {
      for (const call of msg.tool_calls) {
        const fn = call?.function;
        if (!fn || typeof fn !== "object") continue;
        const key = fingerprintToolKey(fn.name);
        if (key) {
          fn.name = key;
          if (typeof fn.arguments === "string") {
            try {
              const args = JSON.parse(fn.arguments);
              if (args && typeof args === "object" && !Array.isArray(args)) {
                if (key === "edit") {
                  if (args.file_path !== undefined && args.filePath === undefined) {
                    args.filePath = args.file_path;
                    delete args.file_path;
                  }
                  if (args.old_string !== undefined && args.oldString === undefined) {
                    args.oldString = args.old_string;
                    delete args.old_string;
                  }
                  if (args.new_string !== undefined && args.newString === undefined) {
                    args.newString = args.new_string;
                    delete args.new_string;
                  }
                  if (args.replace_all !== undefined && args.replaceAll === undefined) {
                    args.replaceAll = args.replace_all;
                    delete args.replace_all;
                  }
                  fn.arguments = JSON.stringify(args);
                } else if (key === "write" || key === "read") {
                  if (args.file_path !== undefined && args.filePath === undefined) {
                    args.filePath = args.file_path;
                    delete args.file_path;
                  }
                  fn.arguments = JSON.stringify(args);
                }
              }
            } catch {
              // Ignore invalid JSON in arguments
            }
          }
        }
      }
    }
  }
}

/**
 * Full request-side pass: canonicalise quartet case variants, remove duplicate
 * quartet declarations, append missing members and preserve the legacy
 * tool_choice defaults used by the OpenCode executor.
 *
 * @param {object} body
 * @param {boolean} flat - true for Responses tools ({name}), false for chat tools
 * @returns {Map<string,string>} map: sent name -> original name
 */
export function applyFingerprintTools(body, flat) {
  if (!body || typeof body !== "object") return new Map();

  const { tools, map } = concealFingerprintToolNames(body.tools, flat);
  body.tools = appendMissingFingerprintTools(tools, flat);
  retargetToolChoice(body, map);
  canonicalizeMessageToolCalls(body.messages);

  // Upstream free tier rejects tool_choice: "none" with 403 FreeTierError.
  // When no explicit tool is targeted, default to "auto".
  if (!body.tool_choice || body.tool_choice === "none") {
    body.tool_choice = "auto";
  }

  recordRenamedToolNames(body, map);
  return map;
}

/** Store the rename map for `body`. */
export function recordRenamedToolNames(body, map) {
  if (!body || typeof body !== "object" || !map?.size) return;
  renamedToolNames.set(body, map);
}

/** Retrieve the rename map for `body`. */
export function takeRenamedToolNames(body) {
  if (!body || typeof body !== "object") return null;
  return renamedToolNames.get(body) || null;
}

// Response side -------------------------------------------------------------

/** Normalize quartet tool arguments from OpenCode camelCase to snake_case */
export function normalizeQuartetToolArgs(name, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const lower = String(name || "").toLowerCase();
  const out = { ...input };
  if (lower === "edit") {
    const path = out.file_path ?? out.filePath ?? out.path ?? out.file;
    if (path !== undefined) {
      out.file_path = path;
      delete out.filePath;
      delete out.path;
      delete out.file;
    }
    const oldStr = out.old_string ?? out.oldString ?? out.old_str ?? out.oldText ?? out.old_text;
    if (oldStr !== undefined) {
      out.old_string = oldStr;
      delete out.oldString;
      delete out.old_str;
      delete out.oldText;
      delete out.old_text;
    }
    const newStr = out.new_string ?? out.newString ?? out.new_str ?? out.newText ?? out.new_text;
    if (newStr !== undefined) {
      out.new_string = newStr;
      delete out.newString;
      delete out.new_str;
      delete out.newText;
      delete out.new_text;
    }
    const replaceAll = out.replace_all ?? out.replaceAll;
    if (replaceAll !== undefined) {
      out.replace_all = Boolean(replaceAll);
      delete out.replaceAll;
    }
  } else if (lower === "write" || lower === "read") {
    const path = out.file_path ?? out.filePath ?? out.path ?? out.file;
    if (path !== undefined) {
      out.file_path = path;
      delete out.filePath;
      delete out.path;
      delete out.file;
    }
  } else if (lower === "bash") {
    const cmd = out.command ?? out.cmd;
    if (cmd !== undefined) {
      out.command = cmd;
      delete out.cmd;
    }
  }
  return out;
}

/** Normalize quartet tool arguments JSON string */
export function normalizeQuartetToolArgsJson(name, argsJson) {
  if (typeof argsJson !== "string") return argsJson;
  try {
    const parsed = JSON.parse(argsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return argsJson;
    return JSON.stringify(normalizeQuartetToolArgs(name, parsed));
  } catch {
    return argsJson;
  }
}

/** Restore caller tool spellings in supported response/event shapes. */
export function restoreToolNames(payload, map) {
  if (!map?.size || !payload) return payload;
  if (Array.isArray(payload)) return payload.map((item) => restoreToolNames(item, map));
  if (typeof payload !== "object") return payload;

  let out = payload;
  const put = (key, value) => {
    if (out === payload) out = { ...payload };
    out[key] = value;
  };

  // Claude streaming content_block_start event.
  if (payload.type === "content_block_start") {
    const block = payload.content_block;
    if (block?.type === "tool_use" && typeof block.name === "string" && map.has(block.name)) {
      put("content_block", { ...block, name: map.get(block.name) });
    }
  }

  // Claude non-streaming message body.
  if (Array.isArray(payload.content)) {
    put("content", payload.content.map((block) => {
      if (block?.type === "tool_use" && typeof block.name === "string") {
        const restoredName = map.has(block.name) ? map.get(block.name) : block.name;
        let input = block.input;
        if (input && typeof input === "object") {
          input = normalizeQuartetToolArgs(restoredName, input);
        }
        return { ...block, name: restoredName, input };
      }
      return block;
    }));
  }

  // OpenAI Chat Completions, both streaming delta and JSON message shapes.
  if (Array.isArray(payload.choices)) {
    put("choices", payload.choices.map((choice) => {
      let changed = false;
      const next = { ...choice };
      for (const holder of ["delta", "message"]) {
        const value = choice?.[holder];
        if (!value || !Array.isArray(value.tool_calls) || value.tool_calls.length === 0) continue;
        const calls = value.tool_calls.map((call) => {
          const name = call?.function?.name;
          const restoredName = typeof name === "string" && map.has(name) ? map.get(name) : name;
          let changedCall = false;
          let fn = call.function;
          if (restoredName !== name) {
            changed = true;
            changedCall = true;
            fn = { ...fn, name: restoredName };
          }
          if (holder === "message" && typeof fn?.arguments === "string") {
            const mappedArgs = normalizeQuartetToolArgsJson(restoredName || name, fn.arguments);
            if (mappedArgs !== fn.arguments) {
              changed = true;
              changedCall = true;
              fn = { ...fn, arguments: mappedArgs };
            }
          }
          return changedCall ? { ...call, function: fn } : call;
        });
        next[holder] = { ...value, tool_calls: calls };
      }
      return changed ? next : choice;
    }));
  }

  // OpenAI Responses final JSON body.
  if (Array.isArray(payload.output)) {
    put("output", payload.output.map((item) =>
      item?.type === "function_call" && typeof item.name === "string" && map.has(item.name)
        ? { ...item, name: map.get(item.name) }
        : item));
  }

  // OpenAI Responses SSE events such as response.output_item.added/done.
  const item = payload.item;
  if (item?.type === "function_call" && typeof item.name === "string" && map.has(item.name)) {
    put("item", { ...item, name: map.get(item.name) });
  }

  return out;
}
