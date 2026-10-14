import { describe, it, expect } from "vitest";
import {
  applyFingerprintTools,
  concealFingerprintToolNames,
  appendMissingFingerprintTools,
  fingerprintToolKey,
  restoreToolNames,
  takeRenamedToolNames,
  OPENCODE_FINGERPRINT_TOOLS,
} from "open-sse/utils/opencodeFingerprint.js";

const CC_TOOLS = ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write", "WebFetch"];
const flat = (names) => names.map((name) => ({ type: "function", name }));
const chat = (names) => names.map((name) => ({ type: "function", function: { name } }));

describe("opencodeFingerprint — request side", () => {
  it("renames capitalised quartet members to lowercase", () => {
    const body = { tools: flat(CC_TOOLS) };
    const map = applyFingerprintTools(body, true);
    const names = body.tools.map((tool) => tool.name);

    expect(names).toContain("bash");
    expect(names).not.toContain("Bash");
    expect(names).toContain("Glob");
    expect(map.get("bash")).toBe("Bash");
  });

  it("removes quartet case duplicates without dropping unrelated case variants", () => {
    const body = { tools: flat(["Bash", "bash", "Glob", "grep", "Read", "Foo", "foo"]) };
    applyFingerprintTools(body, true);

    const names = body.tools.map((tool) => tool.name);
    expect(names.filter((name) => name === "bash")).toHaveLength(1);
    expect(names).toContain("Foo");
    expect(names).toContain("foo");
  });

  it("preserves tool count when a complete quartet is only renamed", () => {
    const body = { tools: flat(CC_TOOLS) };
    applyFingerprintTools(body, true);
    expect(body.tools).toHaveLength(CC_TOOLS.length);
  });

  it("handles the nested chat shape without dropping .function", () => {
    const body = { tools: chat(CC_TOOLS) };
    applyFingerprintTools(body, false);

    const names = body.tools.map((tool) => tool.function.name);
    expect(names).toContain("bash");
    expect(names).not.toContain("Bash");
    expect(body.tools[1].function.name).toBe("bash");
  });

  it("injects all four fingerprint tools when the body carries no tools", () => {
    const body = { tools: [] };
    applyFingerprintTools(body, true);

    expect(body.tools.map((tool) => tool.name).sort()).toEqual([...OPENCODE_FINGERPRINT_TOOLS].sort());
    expect(body.tool_choice).toBe("auto");
  });

  it("defaults chat no-tool tool_choice to auto to avoid 403 FreeTierError", () => {
    const body = {};
    applyFingerprintTools(body, false);

    expect(body.tools.map((tool) => tool.function.name)).toEqual(OPENCODE_FINGERPRINT_TOOLS);
    expect(body.tool_choice).toBe("auto");
  });

  it("does not invent a chat tool_choice when the caller already supplied tools", () => {
    const body = { tools: chat(["terminal"]) };
    applyFingerprintTools(body, false);
    expect(body.tool_choice).toBe("auto");
  });

  it("appends only genuinely missing quartet members", () => {
    const body = { tools: flat(["Bash", "Read", "terminal"]) };
    applyFingerprintTools(body, true);

    const names = body.tools.map((tool) => tool.name);
    expect(names).toContain("edit");
    expect(names).toContain("write");
    expect(names).toContain("terminal");
    expect(body.tools).toHaveLength(5);
  });

  it("retargets flat tool_choice that points at a renamed tool", () => {
    const body = { tools: flat(CC_TOOLS), tool_choice: { type: "function", name: "Bash" } };
    applyFingerprintTools(body, true);
    expect(body.tool_choice.name).toBe("bash");
  });

  it("retargets nested tool_choice that points at a renamed tool", () => {
    const body = {
      tools: chat(CC_TOOLS),
      tool_choice: { type: "function", function: { name: "Read" } },
    };
    applyFingerprintTools(body, false);
    expect(body.tool_choice.function.name).toBe("read");
  });

  it("canonicalises history tool_calls in messages and converts snake_case to camelCase", () => {
    const body = {
      tools: flat(CC_TOOLS),
      messages: [
        {
          role: "assistant",
          tool_calls: [
            {
              function: {
                name: "Edit",
                arguments: JSON.stringify({ file_path: "/test.txt", old_string: "a", new_string: "b", replace_all: true }),
              },
            },
          ],
        },
      ],
    };
    applyFingerprintTools(body, true);
    const tc = body.messages[0].tool_calls[0].function;
    expect(tc.name).toBe("edit");
    const args = JSON.parse(tc.arguments);
    expect(args.filePath).toBe("/test.txt");
    expect(args.oldString).toBe("a");
    expect(args.newString).toBe("b");
    expect(args.replaceAll).toBe(true);
    expect(args.file_path).toBeUndefined();
  });

  it("never throws on malformed tools", () => {
    for (const tools of [null, undefined, "nope", [null, 42, []], [{}, { name: "" }]]) {
      expect(() => concealFingerprintToolNames(tools)).not.toThrow();
      expect(() => appendMissingFingerprintTools(tools, true)).not.toThrow();
    }
  });
});

describe("opencodeFingerprint — response side", () => {
  const map = new Map([["bash", "Bash"], ["grep", "Grep"], ["read", "Read"]]);

  it("restores names in Claude content_block_start chunks", () => {
    const chunk = {
      type: "content_block_start",
      content_block: { type: "tool_use", name: "bash", id: "t1" },
    };
    const out = restoreToolNames(chunk, map);

    expect(out.content_block.name).toBe("Bash");
    expect(chunk.content_block.name).toBe("bash");
  });

  it("recursively restores streaming chunks inside arrays", () => {
    const chunks = [{
      choices: [{ delta: { tool_calls: [{ function: { name: "grep", arguments: "{}" } }] } }],
    }];
    const out = restoreToolNames(chunks, map);
    expect(out[0].choices[0].delta.tool_calls[0].function.name).toBe("Grep");
  });

  it("restores names and normalizes arguments in Claude non-streaming bodies", () => {
    const body = {
      type: "message",
      content: [
        {
          type: "tool_use",
          name: "edit",
          input: { filePath: "/path/to/file", oldString: "old", newString: "new", replaceAll: true },
        },
      ],
    };
    const out = restoreToolNames(body, map);
    expect(out.content[0].name).toBe("Edit");
    expect(out.content[0].input.file_path).toBe("/path/to/file");
    expect(out.content[0].input.old_string).toBe("old");
    expect(out.content[0].input.new_string).toBe("new");
    expect(out.content[0].input.replace_all).toBe(true);
    expect(out.content[0].input.filePath).toBeUndefined();
  });

  it("restores names and normalizes arguments in Chat Completions message shapes", () => {
    const body = {
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: "edit",
                  arguments: JSON.stringify({ filePath: "/path/file", oldString: "a", newString: "b" }),
                },
              },
            ],
          },
        },
        { delta: { tool_calls: [{ function: { name: "read", arguments: "{}" } }] } },
      ],
    };
    const out = restoreToolNames(body, map);

    expect(out.choices[0].message.tool_calls[0].function.name).toBe("Edit");
    const parsedArgs = JSON.parse(out.choices[0].message.tool_calls[0].function.arguments);
    expect(parsedArgs.file_path).toBe("/path/file");
    expect(parsedArgs.old_string).toBe("a");
    expect(parsedArgs.new_string).toBe("b");
    expect(parsedArgs.filePath).toBeUndefined();
    expect(out.choices[1].delta.tool_calls[0].function.name).toBe("Read");
  });

  it("restores names in Responses final output items", () => {
    const body = { output: [{ type: "function_call", name: "bash", call_id: "c1" }] };
    expect(restoreToolNames(body, map).output[0].name).toBe("Bash");
  });

  it("restores names in Responses streaming output_item events", () => {
    const event = {
      type: "response.output_item.added",
      item: { type: "function_call", name: "read", call_id: "c1" },
    };
    expect(restoreToolNames(event, map).item.name).toBe("Read");
  });

  it("is a no-op without a map or with an empty map", () => {
    const body = { choices: [{ message: { tool_calls: [{ function: { name: "bash" } }] } }] };
    expect(restoreToolNames(body, null)).toBe(body);
    expect(restoreToolNames(body, new Map())).toBe(body);
  });

  it("leaves unknown tool names untouched", () => {
    const body = { output: [{ type: "function_call", name: "Edit" }] };
    expect(restoreToolNames(body, map).output[0].name).toBe("Edit");
  });
});

describe("fingerprintToolKey", () => {
  it("maps quartet case/whitespace variants and rejects other tools", () => {
    expect(fingerprintToolKey("Bash")).toBe("bash");
    expect(fingerprintToolKey(" bash ")).toBe("bash");
    expect(fingerprintToolKey("Read")).toBe("read");
    expect(fingerprintToolKey("Edit")).toBe("edit");
    expect(fingerprintToolKey("Write")).toBe("write");
    expect(fingerprintToolKey("GLOB")).toBe("");
    expect(fingerprintToolKey("terminal")).toBe("");
    expect(fingerprintToolKey(null)).toBe("");
  });
});
