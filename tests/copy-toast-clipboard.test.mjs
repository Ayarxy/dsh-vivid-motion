import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Expose the real production watcher in memory only; no browser, build, or runtime dependencies.
const clientUrl = new URL("../packages/dsh-copy-toast/lib/client.js", import.meta.url);
const source = readFileSync(clientUrl, "utf8");
const wiringMarker = "\t\t// ── plugin wiring ";
assert.equal(source.split(wiringMarker).length, 2, "production plugin-wiring marker must be unique");
const instrumentedSource = source.replace(wiringMarker,
  "\t\texports.__installCopyWatcher = installCopyWatcher;\n" + wiringMarker);

class Clock {
  nextId = 1;
  pending = new Map();
  history = new Map();
  setTimeout = (callback) => {
    const id = this.nextId++;
    this.pending.set(id, callback);
    this.history.set(id, callback);
    return id;
  };
  clearTimeout = (id) => { this.pending.delete(id); };
  flush() {
    let count = 0;
    while (this.pending.size) {
      assert.ok(++count < 100, "timer queue must settle");
      const [id, callback] = this.pending.entries().next().value;
      this.pending.delete(id);
      callback();
    }
  }
}

class TransferItems {
  constructor(data) { this.data = data; }
  add(value, type) {
    this.data.requireReadable();
    if (typeof value === "object" && value !== null && typeof value.size === "number") {
      this.data.values.set(`file:${this.data.values.size}`, value);
      return { kind: "file", type: value.type || "" };
    }
    const key = String(type);
    if (this.data.values.has(key)) throw new Error("duplicate format");
    this.data.values.set(key, String(value));
    return { kind: "string", type: key };
  }
  remove(index) {
    this.data.requireReadable();
    const key = [...this.data.values.keys()][index];
    if (key !== undefined) this.data.values.delete(key);
  }
  clear() {
    this.data.requireReadable();
    this.data.values.clear();
  }
}

class Transfer {
  values = new Map();
  readable = true;
  lateReads = 0;
  constructor() { this.items = new TransferItems(this); }
  requireReadable() {
    if (!this.readable) {
      this.lateReads++;
      throw new Error("native event data store is no longer readable");
    }
  }
  get types() {
    this.requireReadable();
    return [...this.values.keys()];
  }
  get files() {
    this.requireReadable();
    return [...this.values.values()].filter(value => typeof value === "object");
  }
  getData(type) {
    this.requireReadable();
    const value = this.values.get(String(type));
    return typeof value === "string" ? value : "";
  }
  setData(type, value) {
    this.requireReadable();
    this.values.set(String(type), String(value));
  }
  clearData(type) {
    this.requireReadable();
    if (!arguments.length) this.values.clear();
    else this.values.delete(String(type));
  }
  invalidate() { this.readable = false; }
}

function clipboardEvent(type = "copy", options = {}) {
  return {
    type,
    target: options.target,
    isTrusted: Object.hasOwn(options, "trusted") ? options.trusted : true,
    clipboardData: Object.hasOwn(options, "data") ? options.data : new Transfer(),
    defaultPrevented: false,
    stopped: false,
    immediate: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.stopped = true; this.immediate = true; }
  };
}

class Document {
  nodeType = 9;
  listeners = new Map();
  body = { nodeType: 1, tagName: "BODY", isContentEditable: false };
  activeElement = this.body;
  documentElement = { getAttribute() { return "en"; } };
  addEventListener(type, callback, options) {
    const capture = options === true || options?.capture === true;
    const list = this.listeners.get(type) || [];
    list.push({ callback, capture });
    this.listeners.set(type, list);
  }
  removeEventListener(type, callback, options) {
    const capture = options === true || options?.capture === true;
    this.listeners.set(type, (this.listeners.get(type) || [])
      .filter(listener => listener.callback !== callback || listener.capture !== capture));
  }
  dispatch(event, targetListener = () => {}) {
    event.target ??= this.body;
    const listeners = [...(this.listeners.get(event.type) || [])];
    try {
      for (const listener of listeners.filter(listener => listener.capture)) {
        if (event.immediate) break;
        listener.callback(event);
      }
      if (!event.stopped) targetListener(event);
      if (!event.stopped) {
        for (const listener of listeners.filter(listener => !listener.capture)) {
          if (event.immediate) break;
          listener.callback(event);
        }
      }
    } finally {
      event.clipboardData?.invalidate();
    }
    return !event.defaultPrevented;
  }
  execCommand(command) {
    assert.equal(command, "copy");
    return this.dispatch(clipboardEvent());
  }
}

function makeEnvironment(clipboard = undefined) {
  const clock = new Clock();
  const document = new Document();
  const notices = [];
  let selection;
  const window = {
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    getSelection: () => selection,
    __ModuleLoader__: {
      load(record) { this.exports = record.factory(() => ({})); }
    }
  };
  const context = vm.createContext({
    window,
    document,
    navigator: { clipboard, language: "en" },
    console,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });
  vm.runInContext(instrumentedSource, context, { filename: clientUrl.pathname });
  const install = window.__ModuleLoader__.exports.__installCopyWatcher;
  assert.equal(typeof install, "function");
  const environment = {
    clipboard, clock, document, notices, context,
    evaluate: expression => vm.runInContext(expression, context),
    install: (copy = () => notices.push("copy"), cut = () => notices.push("cut")) => install(copy, cut),
    select(text, editable = false) {
      const host = { nodeType: 1, tagName: "DIV", isContentEditable: editable };
      selection = {
        rangeCount: text.length ? 1 : 0,
        anchorNode: { nodeType: 3, parentElement: host },
        focusNode: { nodeType: 3, parentElement: host },
        toString: () => text
      };
    }
  };
  environment.select("");
  return environment;
}

function control(tagName, { start = 0, end = 0, readOnly = false, disabled = false, value = "" } = {}) {
  return { nodeType: 1, tagName, selectionStart: start, selectionEnd: end, readOnly, disabled, value };
}

// Deterministic single-text-node Range; real multi-node DOM coverage is in the browser runner.
function editableRange(text, start, end) {
  const root = { nodeType: 1, tagName: "DIV", isContentEditable: true, isConnected: true, textContent: text };
  const node = { nodeType: 3, parentElement: root };
  root.contains = candidate => candidate === root || candidate === node;
  const range = {
    startContainer: node, startOffset: start, endContainer: node, endOffset: end,
    cloneRange() {
      let offset = 0;
      return {
        selectNodeContents(host) { assert.equal(host, root); },
        setEnd(container, nextOffset) { assert.equal(container, node); offset = nextOffset; },
        toString() { return text.slice(0, offset); }
      };
    }
  };
  const selection = {
    rangeCount: 1, anchorNode: node, focusNode: node,
    getRangeAt(index) { assert.equal(index, 0); return range; },
    toString() { return text.slice(start, end); }
  };
  return { root, selection };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function verifyTransferRestored(data, before) {
  for (const [target, key, descriptor] of before) {
    assert.deepEqual(Object.getOwnPropertyDescriptor(target, key), descriptor, `${key} descriptor restored exactly`);
  }
  assert.equal(data.lateReads, 0, "never read native event data after dispatch");
}

function transferDescriptors(data) {
  return [
    [data, "setData"], [data, "clearData"],
    [data.items, "add"], [data.items, "remove"], [data.items, "clear"]
  ].map(([target, key]) => [target, key, Object.getOwnPropertyDescriptor(target, key)]);
}

test("native selected copy is deferred and nonempty readonly controls can still copy", () => {
  const env = makeEnvironment();
  const dispose = env.install();
  env.select("selected DOM text");
  env.document.dispatch(clipboardEvent());
  assert.deepEqual(env.notices, []);
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy"]);
  const input = control("INPUT", { end: 2, readOnly: true });
  env.document.dispatch(clipboardEvent("copy", { target: input }));
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy", "copy"]);
  dispose();
});

for (const trusted of [false, undefined, null, 1, "true"]) {
  test(`synthetic event with isTrusted=${JSON.stringify(trusted)} never confirms or instruments data`, () => {
    const env = makeEnvironment();
    env.install();
    env.select("selected");
    const data = new Transfer();
    const before = transferDescriptors(data);
    env.document.dispatch(clipboardEvent("copy", { trusted, data }), event => {
      event.preventDefault();
      event.clipboardData.setData("text/plain", "synthetic payload");
    });
    assert.equal(env.clock.pending.size, 0);
    env.clock.flush();
    assert.deepEqual(env.notices, []);
    verifyTransferRestored(data, before);
  });
}

test("pure cancellation suppresses even a nonempty selection", () => {
  const env = makeEnvironment();
  env.install();
  env.select("selected");
  const event = clipboardEvent();
  env.document.dispatch(event, event => event.preventDefault());
  env.clock.flush();
  assert.deepEqual(env.notices, []);
  assert.equal(event.clipboardData.lateReads, 0);
});

test("cancelled custom copy snapshots payload during dispatch and preserves own descriptors", () => {
  const env = makeEnvironment();
  env.install();
  const data = new Transfer();
  Object.defineProperty(data, "setData", {
    value: data.setData, writable: false, enumerable: true, configurable: true
  });
  Object.defineProperty(data.items, "clear", {
    get: () => TransferItems.prototype.clear, enumerable: true, configurable: true
  });
  const before = transferDescriptors(data);
  env.document.dispatch(clipboardEvent("copy", { data }), event => {
    event.preventDefault();
    assert.equal(event.clipboardData.setData("text/plain", "custom"), undefined);
  });
  assert.equal(data.readable, false, "simulate native DataTransfer becoming unreadable immediately");
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy"]);
  verifyTransferRestored(data, before);
});

const mutationCases = [
  ["empty setData", data => data.setData("text/plain", ""), 0],
  ["clear all formats", data => { data.setData("text/plain", "payload"); data.clearData(); }, 0],
  ["clear specific format", data => { data.setData("text/plain", "payload"); data.clearData("text/plain"); }, 0],
  ["replace payload with empty text", data => { data.setData("text/plain", "payload"); data.setData("text/plain", ""); }, 0],
  ["items.add nonempty", data => data.items.add("payload", "text/plain"), 1],
  ["items.add empty", data => data.items.add("", "text/plain"), 0],
  ["items.clear", data => { data.items.add("payload", "text/plain"); data.items.clear(); }, 0],
  ["items.remove", data => { data.items.add("payload", "text/plain"); data.items.remove(0); }, 0],
  ["another nonempty format remains", data => {
    data.setData("text/plain", "payload"); data.setData("text/html", "<b>payload</b>"); data.clearData("text/plain");
  }, 1],
  ["nonempty file", data => data.items.add({ size: 3, type: "image/png" }), 1],
  ["empty file", data => data.items.add({ size: 0, type: "image/png" }), 0]
];
for (const [name, mutate, expected] of mutationCases) {
  test(`cancelled custom copy: ${name}`, () => {
    const env = makeEnvironment();
    env.install();
    const data = new Transfer();
    const before = transferDescriptors(data);
    env.document.dispatch(clipboardEvent("copy", { data }), event => {
      event.preventDefault();
      mutate(event.clipboardData);
    });
    env.clock.flush();
    assert.equal(env.notices.length, expected);
    verifyTransferRestored(data, before);
  });
}

test("stopPropagation cannot hide custom payload from the capture observer", () => {
  const env = makeEnvironment();
  env.install();
  let bubbled = 0;
  env.document.addEventListener("copy", () => bubbled++);
  const event = clipboardEvent();
  env.document.dispatch(event, event => {
    event.preventDefault();
    event.stopPropagation();
    event.clipboardData.setData("text/html", "<b>payload</b>");
  });
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy"]);
  assert.equal(bubbled, 0);
  assert.equal(event.clipboardData.lateReads, 0);
});

test("native selected copy is still confirmed with propagation stopped", () => {
  const env = makeEnvironment();
  env.install();
  env.select("selected");
  env.document.dispatch(clipboardEvent(), event => event.stopPropagation());
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy"]);
});

for (const tag of ["INPUT", "TEXTAREA"]) {
  test(`${tag} event-target selection is authoritative even with stale nonempty DOM selection`, () => {
    const env = makeEnvironment();
    env.install();
    env.select("stale DOM selection", true);
    env.document.dispatch(clipboardEvent("copy", { target: control(tag) }));
    env.clock.flush();
    assert.deepEqual(env.notices, []);
  });
  test(`${tag} focused empty selection prevents fallback to old DOM selection`, () => {
    const env = makeEnvironment();
    env.install();
    env.select("stale DOM selection", true);
    env.document.activeElement = control(tag);
    env.document.dispatch(clipboardEvent());
    env.clock.flush();
    assert.deepEqual(env.notices, []);
  });
  test(`${tag} real selected editable text supports native copy and cut`, () => {
    const env = makeEnvironment();
    env.install();
    env.document.activeElement = control(tag, { start: 1, end: 4 });
    env.document.dispatch(clipboardEvent("copy"));
    env.document.dispatch(clipboardEvent("cut"));
    env.clock.flush();
    assert.deepEqual(env.notices, ["copy", "cut"]);
  });
  for (const property of ["readOnly", "disabled"]) {
    test(`${tag} ${property} selection does not claim a cut`, () => {
      const env = makeEnvironment();
      env.install();
      env.document.activeElement = control(tag, { end: 2, [property]: true });
      env.select("unrelated editable DOM selection", true);
      env.document.dispatch(clipboardEvent("cut"));
      env.clock.flush();
      assert.deepEqual(env.notices, []);
    });
  }
}

test("controls without readable selection APIs never fall back to DOM selection", () => {
  const env = makeEnvironment();
  env.install();
  env.select("stale DOM selection", true);
  const input = control("INPUT");
  Object.defineProperty(input, "selectionStart", { get() { throw new Error("not supported"); } });
  env.document.activeElement = input;
  env.document.dispatch(clipboardEvent());
  env.clock.flush();
  assert.deepEqual(env.notices, []);
});

test("ordinary selected DOM text is copyable but not cuttable; contenteditable selection is cuttable", () => {
  const env = makeEnvironment();
  env.install();
  env.select("ordinary text");
  env.document.dispatch(clipboardEvent("copy"));
  env.document.dispatch(clipboardEvent("cut"));
  env.select("editable text", true);
  env.document.dispatch(clipboardEvent("cut"));
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy", "cut"]);
});

test("cancelled cut with custom data alone cannot prove any text was deleted", () => {
  const env = makeEnvironment();
  env.install();
  env.select("editable text", true);
  env.document.dispatch(clipboardEvent("cut"), event => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", "editable text");
  });
  env.clock.flush();
  assert.deepEqual(env.notices, []);
});

for (const tag of ["INPUT", "TEXTAREA"]) {
  test(`${tag} editor-managed cut confirms after writing data and deleting precisely the selected text`, () => {
    const env = makeEnvironment();
    env.install();
    const input = control(tag, { value: "前🙂剪切后", start: 3, end: 5 });
    env.document.activeElement = input;
    const data = new Transfer();
    const before = transferDescriptors(data);
    env.document.dispatch(clipboardEvent("cut", { target: input, data }), event => {
      event.preventDefault();
      event.stopPropagation();
      event.clipboardData.setData("text/plain", "剪切");
      input.value = "前🙂后";
      input.selectionStart = input.selectionEnd = 3;
    });
    assert.deepEqual(env.notices, []);
    env.clock.flush();
    assert.deepEqual(env.notices, ["cut"]);
    verifyTransferRestored(data, before);
  });

  for (const [name, write, after] of [
    ["only copied, without deletion", "cut", "preCUTpost"],
    ["empty clipboard payload despite deletion", "", "prepost"],
    ["unrelated edit rather than deletion", "cut", "PREcutPOST"],
    ["merely collapsed selection", "cut", "preCUTpost"]
  ]) {
    test(`${tag} cancelled cut does not confirm when ${name}`, () => {
      const env = makeEnvironment();
      env.install();
      const input = control(tag, { value: "preCUTpost", start: 3, end: 6 });
      env.document.activeElement = input;
      const event = clipboardEvent("cut", { target: input });
      env.document.dispatch(event, event => {
        event.preventDefault();
        event.clipboardData.setData("text/plain", write);
        input.value = after;
        input.selectionStart = input.selectionEnd = 3;
      });
      env.clock.flush();
      assert.deepEqual(env.notices, []);
      assert.equal(event.clipboardData.lateReads, 0);
    });
  }
}

test("Lexical-style contenteditable cut confirms once after deferred DOM reconciliation", async () => {
  const env = makeEnvironment();
  const dispose = env.install();
  const { root, selection } = editableRange("before CUT after", 7, 10);
  env.context.window.getSelection = () => selection;
  const data = new Transfer();
  const before = transferDescriptors(data);
  env.document.dispatch(clipboardEvent("cut", { target: root, data }), event => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", "CUT");
    event.clipboardData.setData("text/html", "<b>CUT</b>");
    Promise.resolve().then(() => { root.textContent = "before  after"; });
  });
  await Promise.resolve();
  env.clock.flush();
  env.clock.flush();
  assert.deepEqual(env.notices, ["cut"]);
  verifyTransferRestored(data, before);
  dispose();
});

for (const [name, mutate] of [
  ["no text removal", root => {}],
  ["only formatting/selection changes", root => { root.isContentEditable = true; }],
  ["a different text replacement", root => { root.textContent = "before NEW after"; }],
  ["a removed editor with stale detached content", root => { root.textContent = "before  after"; root.isConnected = false; }]
]) {
  test(`contenteditable cancelled cut stays silent for ${name}`, () => {
    const env = makeEnvironment();
    env.install();
    const { root, selection } = editableRange("before CUT after", 7, 10);
    env.context.window.getSelection = () => selection;
    const event = clipboardEvent("cut", { target: root });
    env.document.dispatch(event, event => {
      event.preventDefault();
      event.clipboardData.setData("text/plain", "CUT");
      mutate(root);
    });
    env.clock.flush();
    assert.deepEqual(env.notices, []);
    assert.equal(event.clipboardData.lateReads, 0);
  });
}

test("synthetic custom cut and a disposed pending cut never emit confirmation", () => {
  const env = makeEnvironment();
  const dispose = env.install();
  const input = control("TEXTAREA", { value: "preCUTpost", start: 3, end: 6 });
  env.document.activeElement = input;
  env.document.dispatch(clipboardEvent("cut", { target: input, trusted: false }), event => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", "CUT");
    input.value = "prepost";
  });
  env.clock.flush();
  assert.deepEqual(env.notices, []);
  input.value = "preCUTpost";
  env.document.dispatch(clipboardEvent("cut", { target: input }), event => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", "CUT");
    input.value = "prepost";
  });
  dispose();
  env.clock.flush();
  assert.deepEqual(env.notices, []);
});

test("unpatchable mutation methods are conservatively silent for cancelled custom copies", () => {
  const env = makeEnvironment();
  env.install();
  const data = new Transfer();
  Object.defineProperty(data, "clearData", { value: data.clearData, configurable: false, writable: false });
  const before = transferDescriptors(data);
  env.document.dispatch(clipboardEvent("copy", { data }), event => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", "payload");
  });
  env.clock.flush();
  assert.deepEqual(env.notices, []);
  verifyTransferRestored(data, before);
});

test("later DataTransfer wrappers are not overwritten by timer cleanup", () => {
  const env = makeEnvironment();
  env.install();
  const data = new Transfer();
  let thirdParty;
  env.document.dispatch(clipboardEvent("copy", { data }), event => {
    const saved = event.clipboardData.setData;
    thirdParty = function (...args) { return Reflect.apply(saved, this, args); };
    event.clipboardData.setData = thirdParty;
    event.preventDefault();
    event.clipboardData.setData("text/plain", "payload");
  });
  env.clock.flush();
  assert.equal(data.setData, thirdParty);
  assert.deepEqual(env.notices, [], "replacement prevents a reliable complete mutation snapshot");
  assert.equal(Object.hasOwn(data, "clearData"), false);
  assert.equal(data.lateReads, 0);
});

test("API methods preserve receiver, argument identity, Promise identity and fulfillment value", async () => {
  const promise = Promise.resolve({ result: "original value" });
  let receivedThis, receivedArgs;
  const clipboard = {
    writeText(...args) { receivedThis = this; receivedArgs = args; return promise; }
  };
  const env = makeEnvironment(clipboard);
  env.install();
  const receiver = { other: true };
  const text = "payload", extra = { identity: true };
  const result = Reflect.apply(clipboard.writeText, receiver, [text, extra]);
  assert.equal(result, promise);
  assert.equal(receivedThis, receiver);
  assert.equal(receivedArgs[0], text);
  assert.equal(receivedArgs[1], extra);
  assert.equal(await result, await promise);
  assert.deepEqual(env.notices, ["copy"]);
});

test("API methods preserve null and undefined receivers on detached strict calls", () => {
  const receivers = [];
  const clipboard = { writeText: function () { "use strict"; receivers.push(this); return "result"; } };
  const env = makeEnvironment(clipboard);
  env.install();
  const detached = clipboard.writeText;
  assert.equal(detached("payload"), "result");
  assert.equal(Reflect.apply(detached, null, ["payload"]), "result");
  assert.deepEqual(receivers, [undefined, null]);
  assert.deepEqual(env.notices, ["copy", "copy"]);
});

test("feedback exceptions never reject successful API promises or throw from sync methods", async () => {
  const promise = Promise.resolve("fulfilled");
  const clipboard = { writeText() { return promise; }, write() { return 42; } };
  const env = makeEnvironment(clipboard);
  env.install(() => { throw new Error("optional feedback failed"); });
  assert.equal(clipboard.writeText("payload"), promise);
  assert.equal(await promise, "fulfilled");
  assert.equal(clipboard.write([{}]), 42);
});

test("feedback exceptions do not escape DOM event timers", () => {
  const env = makeEnvironment();
  env.install(() => { throw new Error("feedback failed"); });
  env.select("payload");
  env.document.dispatch(clipboardEvent());
  assert.doesNotThrow(() => env.clock.flush());
});

test("API synchronous exceptions and rejection objects are preserved without confirmation", async () => {
  const failure = new Error("original failure");
  const rejected = Promise.reject(failure);
  const clipboard = {
    writeText() { throw failure; },
    write() { return rejected; }
  };
  const env = makeEnvironment(clipboard);
  env.install();
  assert.throws(() => clipboard.writeText("payload"), error => error === failure);
  assert.equal(clipboard.write([{}]), rejected);
  await assert.rejects(rejected, error => error === failure);
  assert.deepEqual(env.notices, []);
});

test("throwing then getters do not turn an original return into an instrumentation exception", () => {
  let reads = 0;
  const value = { get then() { reads++; throw new Error("observer access failed"); } };
  const clipboard = { writeText() { return value; } };
  const env = makeEnvironment(clipboard);
  env.install();
  assert.equal(clipboard.writeText("payload"), value);
  assert.equal(reads, 1);
  assert.deepEqual(env.notices, []);
});

test("primitive empty text and boxed empty String fulfill silently; standard boxed nonempty text confirms", async () => {
  let calls = 0;
  const received = [];
  const clipboard = { writeText(value) { calls++; received.push(value); String(value); return Promise.resolve(value); } };
  const env = makeEnvironment(clipboard);
  env.install();
  const boxedEmpty = env.evaluate('new String("")');
  const boxedFull = env.evaluate('new String("payload")');
  assert.equal(await clipboard.writeText(""), "");
  assert.equal(await clipboard.writeText(boxedEmpty), boxedEmpty);
  assert.equal(await clipboard.writeText(boxedFull), boxedFull);
  assert.equal(calls, 3);
  assert.equal(received[1], boxedEmpty, "boxed object is never replaced by a preconverted primitive");
  assert.deepEqual(env.notices, ["copy"]);
});

test("unknown user coercions are never repeated or preconverted", async () => {
  let conversions = 0;
  const text = { toString() { conversions++; return ""; } };
  const clipboard = { writeText(value) { assert.equal(value, text); String(value); return Promise.resolve("ok"); } };
  const env = makeEnvironment(clipboard);
  env.install();
  assert.equal(await clipboard.writeText(text), "ok");
  assert.equal(conversions, 1);
  assert.deepEqual(env.notices, []);
});

test("boxed String with overridden coercion is conservative and never invokes it a second time", async () => {
  let conversions = 0;
  const boxed = new String("nonempty internal value");
  boxed.toString = () => { conversions++; return ""; };
  const clipboard = { writeText(value) { String(value); return Promise.resolve(); } };
  const env = makeEnvironment(clipboard);
  env.install();
  await clipboard.writeText(boxed);
  assert.equal(conversions, 1);
  assert.deepEqual(env.notices, []);
});

test("boxed String Symbol.toPrimitive accessors run only in the original API and remain conservative", async () => {
  let getterCalls = 0, primitiveCalls = 0;
  const clipboard = { writeText(value) { String(value); return Promise.resolve(); } };
  const env = makeEnvironment(clipboard);
  env.install();
  const boxed = env.evaluate('new String("nonempty internal value")');
  Object.defineProperty(boxed, Symbol.toPrimitive, {
    get() { getterCalls++; return () => { primitiveCalls++; return ""; }; }
  });
  await clipboard.writeText(boxed);
  assert.equal(getterCalls, 1);
  assert.equal(primitiveCalls, 1);
  assert.deepEqual(env.notices, []);
});

test("custom coercion exceptions keep original synchronous throw behavior", () => {
  const failure = new Error("conversion failed");
  let conversions = 0;
  const value = { toString() { conversions++; throw failure; } };
  const clipboard = { writeText(value) { String(value); return Promise.resolve(); } };
  const env = makeEnvironment(clipboard);
  env.install();
  assert.throws(() => clipboard.writeText(value), error => error === failure);
  assert.equal(conversions, 1);
  assert.deepEqual(env.notices, []);
});

test("known nonempty primitive DOMString conversions confirm without preconverting arguments", async () => {
  const values = [null, undefined, 0, false, 1n];
  const received = [];
  const clipboard = { writeText(value) { received.push(value); String(value); return Promise.resolve(); } };
  const env = makeEnvironment(clipboard);
  env.install();
  for (const value of values) await clipboard.writeText(value);
  assert.deepEqual(received, values);
  assert.equal(env.notices.length, values.length);
});

test("write([]) fulfillment is silent and a standard nonempty array is confirmed without changing it", async () => {
  const received = [];
  const clipboard = { write(value) { received.push(value); [...value]; return Promise.resolve("result"); } };
  const env = makeEnvironment(clipboard);
  env.install();
  const empty = [], full = [{}];
  assert.equal(await clipboard.write(empty), "result");
  assert.equal(await clipboard.write(full), "result");
  assert.equal(received[0], empty);
  assert.equal(received[1], full);
  assert.deepEqual(env.notices, ["copy"]);
});

test("custom write iterators are consumed only once by the original API, never by the watcher", async () => {
  let iterators = 0, nextCalls = 0;
  const items = {
    [Symbol.iterator]() {
      iterators++;
      let done = false;
      return { next() { nextCalls++; if (done) return { done: true }; done = true; return { done: false, value: {} }; } };
    }
  };
  const clipboard = { write(value) { assert.equal(value, items); [...value]; return Promise.resolve(); } };
  const env = makeEnvironment(clipboard);
  env.install();
  await clipboard.write(items);
  assert.equal(iterators, 1);
  assert.equal(nextCalls, 2);
  assert.deepEqual(env.notices, [], "unknown iterables are conservatively unconfirmed");
});

test("array iterator accessors are not read by payload inspection", async () => {
  let gets = 0, iterations = 0;
  const items = [{}];
  Object.defineProperty(items, Symbol.iterator, {
    get() { gets++; return function* () { iterations++; yield items[0]; }; }
  });
  const clipboard = { write(value) { [...value]; return Promise.resolve(); } };
  const env = makeEnvironment(clipboard);
  env.install();
  await clipboard.write(items);
  assert.equal(gets, 1);
  assert.equal(iterations, 1);
  assert.deepEqual(env.notices, []);
});

test("payload snapshot occurs before an original write mutates its input array", () => {
  const items = [{}];
  const clipboard = { write(value) { value.pop(); return "success"; } };
  const env = makeEnvironment(clipboard);
  env.install();
  assert.equal(clipboard.write(items), "success");
  assert.equal(items.length, 0);
  assert.deepEqual(env.notices, ["copy"]);
});

test("disposal cancels pending timers, restores event methods, and silences already queued callbacks", () => {
  const env = makeEnvironment();
  const dispose = env.install();
  env.select("selected");
  const data = new Transfer();
  const before = transferDescriptors(data);
  env.document.dispatch(clipboardEvent("copy", { data }), event => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", "payload");
  });
  const queued = [...env.clock.history.values()][0];
  assert.equal(env.clock.pending.size, 1);
  dispose();
  dispose();
  assert.equal(env.clock.pending.size, 0);
  verifyTransferRestored(data, before);
  queued(); // Simulate a callback already taken from the native timer queue before cancellation.
  env.clock.flush();
  assert.deepEqual(env.notices, []);
  assert.equal(env.document.listeners.get("copy").length, 0);
  assert.equal(env.document.listeners.get("cut").length, 0);
});

test("pending API promises that fulfill after disposal never call old feedback", async () => {
  const pending = deferred();
  const original = function () { return pending.promise; };
  const clipboard = { writeText: original };
  const env = makeEnvironment(clipboard);
  const dispose = env.install();
  const result = clipboard.writeText("payload");
  dispose();
  assert.equal(clipboard.writeText, original);
  pending.resolve("fulfilled after disposal");
  assert.equal(await result, "fulfilled after disposal");
  assert.deepEqual(env.notices, []);
});

test("third-party wrappers retaining the old patch stay installed and old watchers become silent", async () => {
  let calls = 0;
  const original = function () { calls++; return Promise.resolve("value"); };
  const clipboard = { writeText: original };
  const env = makeEnvironment(clipboard);
  const dispose = env.install();
  const oldPatch = clipboard.writeText;
  const thirdParty = function (...args) { return Reflect.apply(oldPatch, this, args); };
  clipboard.writeText = thirdParty;
  dispose();
  assert.equal(clipboard.writeText, thirdParty);
  assert.equal(await clipboard.writeText("later"), "value");
  assert.equal(await Reflect.apply(oldPatch, clipboard, ["direct old reference"]), "value");
  assert.equal(calls, 2);
  assert.deepEqual(env.notices, []);
  const disposeNew = env.install();
  await clipboard.writeText("new watcher");
  assert.deepEqual(env.notices, ["copy"]);
  disposeNew();
  assert.equal(clipboard.writeText, thirdParty);
});

test("inactive old wrappers preserve strict receiver and synchronous failures", () => {
  const failure = new Error("native throw");
  let receiver;
  const original = function () { "use strict"; receiver = this; throw failure; };
  const clipboard = { writeText: original };
  const env = makeEnvironment(clipboard);
  const dispose = env.install();
  const oldPatch = clipboard.writeText;
  dispose();
  assert.throws(() => Reflect.apply(oldPatch, null, ["payload"]), error => error === failure);
  assert.equal(receiver, null);
  assert.deepEqual(env.notices, []);
});

test("each method patches its accurate owner when an instance shadows only writeText", async () => {
  let protoTextCalls = 0, ownTextCalls = 0, writeCalls = 0;
  const proto = {
    writeText() { protoTextCalls++; return Promise.resolve(); },
    write() { writeCalls++; return Promise.resolve(); }
  };
  const clipboard = Object.create(proto);
  Object.defineProperty(clipboard, "writeText", {
    value() { ownTextCalls++; return Promise.resolve(); },
    writable: true, configurable: true, enumerable: false
  });
  const ownBefore = Object.getOwnPropertyDescriptor(clipboard, "writeText");
  const writeBefore = Object.getOwnPropertyDescriptor(proto, "write");
  const protoTextBefore = proto.writeText;
  const env = makeEnvironment(clipboard);
  const dispose = env.install();
  assert.notEqual(clipboard.writeText, ownBefore.value);
  assert.equal(proto.writeText, protoTextBefore);
  assert.notEqual(proto.write, writeBefore.value);
  assert.equal(Object.hasOwn(clipboard, "write"), false, "never install a second instance patch over inherited API");
  await clipboard.writeText("payload");
  await clipboard.write([{}]);
  assert.deepEqual([protoTextCalls, ownTextCalls, writeCalls], [0, 1, 1]);
  assert.deepEqual(env.notices, ["copy", "copy"]);
  dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptor(clipboard, "writeText"), ownBefore);
  assert.deepEqual(Object.getOwnPropertyDescriptor(proto, "write"), writeBefore);
});

test("each method patches its accurate owner when an instance shadows only write", async () => {
  const proto = { writeText() { return Promise.resolve(); }, write() { throw new Error("shadowed prototype must not run"); } };
  const clipboard = Object.create(proto);
  clipboard.write = function () { return Promise.resolve(); };
  const protoWrite = proto.write;
  const ownWrite = clipboard.write;
  const protoText = proto.writeText;
  const env = makeEnvironment(clipboard);
  const dispose = env.install();
  assert.equal(proto.write, protoWrite);
  assert.notEqual(clipboard.write, ownWrite);
  assert.notEqual(proto.writeText, protoText);
  assert.equal(Object.hasOwn(clipboard, "writeText"), false);
  await clipboard.writeText("payload");
  await clipboard.write([{}]);
  assert.deepEqual(env.notices, ["copy", "copy"]);
  dispose();
  assert.equal(clipboard.write, ownWrite);
  assert.equal(proto.writeText, protoText);
});

test("the actual inherited prototype wins over an unrelated window.Clipboard prototype", async () => {
  const proto = { writeText() { return Promise.resolve(); } };
  const clipboard = Object.create(proto);
  const env = makeEnvironment(clipboard);
  const unrelated = function Clipboard() {};
  unrelated.prototype.writeText = () => { throw new Error("unrelated prototype"); };
  env.context.window.Clipboard = unrelated;
  const unrelatedMethod = unrelated.prototype.writeText;
  const original = proto.writeText;
  const dispose = env.install();
  assert.notEqual(proto.writeText, original);
  assert.equal(unrelated.prototype.writeText, unrelatedMethod);
  await clipboard.writeText("payload");
  assert.deepEqual(env.notices, ["copy"]);
  dispose();
});

test("nonwritable API methods do not prevent DOM watching or other method patches", async () => {
  const clipboard = { write() { return Promise.resolve(); } };
  const locked = function () { return Promise.resolve(); };
  Object.defineProperty(clipboard, "writeText", { value: locked, writable: false, configurable: false });
  const env = makeEnvironment(clipboard);
  env.install();
  assert.equal(clipboard.writeText, locked);
  await clipboard.write([{}]);
  env.select("selected");
  env.document.dispatch(clipboardEvent());
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy", "copy"]);
});

test("a synchronous API execCommand event and nested write calls share one confirmation", async () => {
  let env;
  const clipboard = {
    write() {
      env.document.execCommand("copy");
      return Promise.resolve("inner");
    },
    writeText() {
      this.write([{}]);
      env.document.execCommand("copy");
      return Promise.resolve("outer");
    }
  };
  env = makeEnvironment(clipboard);
  env.install();
  env.select("selected");
  assert.equal(await clipboard.writeText("payload"), "outer");
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy"]);
});

test("a nested writeText call inside write shares the operation in the opposite direction", async () => {
  let env;
  const clipboard = {
    writeText() { return Promise.resolve(); },
    write() { this.writeText("nested payload"); env.document.execCommand("copy"); return Promise.resolve(); }
  };
  env = makeEnvironment(clipboard);
  env.install();
  env.select("selected");
  await clipboard.write([{}]);
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy"]);
});

test("a successful synchronous execCommand event still confirms when its API promise rejects", async () => {
  const failure = new Error("async write failed");
  let env;
  const clipboard = {
    writeText() { env.document.execCommand("copy"); return Promise.reject(failure); }
  };
  env = makeEnvironment(clipboard);
  env.install();
  env.select("selected");
  await assert.rejects(clipboard.writeText("payload"), error => error === failure);
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy"]);
});

test("independent consecutive API writes and their synchronous events are never time-debounced", async () => {
  let env;
  const clipboard = { writeText() { env.document.execCommand("copy"); return Promise.resolve(); } };
  env = makeEnvironment(clipboard);
  env.install();
  env.select("selected");
  const first = clipboard.writeText("same payload");
  const second = clipboard.writeText("same payload");
  await Promise.all([first, second]);
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy", "copy"]);
});

test("independent consecutive DOM events each confirm even in the same task", () => {
  const env = makeEnvironment();
  env.install();
  env.select("same selected text");
  env.document.dispatch(clipboardEvent());
  env.document.dispatch(clipboardEvent());
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy", "copy"]);
});

test("a copy initiated by feedback is a new operation, not a nested native call", async () => {
  const clipboard = { writeText() { return Promise.resolve(); } };
  const env = makeEnvironment(clipboard);
  let count = 0;
  env.install(() => { if (++count === 1) clipboard.writeText("second real copy"); });
  await clipboard.writeText("first copy");
  await Promise.resolve();
  assert.equal(count, 2);
});

test("plain empty DOM selection never confirms a native copy", () => {
  const env = makeEnvironment();
  env.install();
  const event = clipboardEvent();
  env.document.dispatch(event);
  env.clock.flush();
  assert.deepEqual(env.notices, []);
  assert.equal(event.clipboardData.lateReads, 0);
});

test("event mutation wrappers preserve arguments, receiver, return values and conversion exceptions", () => {
  const env = makeEnvironment();
  env.install();
  const data = new Transfer();
  const result = { identity: true };
  let conversions = 0, received;
  const value = { toString() { conversions++; return "payload"; } };
  Object.defineProperty(data, "setData", {
    configurable: false, writable: true, enumerable: false,
    value: function (...args) {
      received = { receiver: this, args };
      Transfer.prototype.setData.apply(this, args);
      return result;
    }
  });
  const before = transferDescriptors(data);
  env.document.dispatch(clipboardEvent("copy", { data }), event => {
    event.preventDefault();
    assert.equal(event.clipboardData.setData("text/plain", value), result);
  });
  env.clock.flush();
  assert.equal(received.receiver, data);
  assert.equal(received.args[1], value);
  assert.equal(conversions, 1);
  assert.deepEqual(env.notices, ["copy"]);
  verifyTransferRestored(data, before);
});

test("event mutation exceptions retain their identity and cannot create a false custom copy", () => {
  const failure = new Error("native DataTransfer conversion failed");
  const env = makeEnvironment();
  env.install();
  const event = clipboardEvent();
  let conversions = 0;
  env.document.dispatch(event, event => {
    event.preventDefault();
    const value = { toString() { conversions++; throw failure; } };
    assert.throws(() => event.clipboardData.setData("text/plain", value), error => error === failure);
  });
  env.clock.flush();
  assert.equal(conversions, 1);
  assert.deepEqual(env.notices, []);
  assert.equal(event.clipboardData.lateReads, 0);
});

test("inaccessible boxed-String conversion metadata is unknown, never mistaken for absence", async () => {
  let conversions = 0;
  const clipboard = { writeText(value) { String(value); return Promise.resolve(); } };
  const env = makeEnvironment(clipboard);
  env.install();
  const boxed = env.evaluate('new String("nonempty internal value")');
  const prototype = new Proxy({
    [Symbol.toPrimitive]() { conversions++; return ""; },
    toString: env.evaluate("String.prototype.toString")
  }, {
    getOwnPropertyDescriptor(target, key) {
      if (key === Symbol.toPrimitive) throw new Error("conversion metadata inaccessible");
      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });
  Object.setPrototypeOf(boxed, prototype);
  await clipboard.writeText(boxed);
  assert.equal(conversions, 1);
  assert.deepEqual(env.notices, []);
});

test("captured String intrinsic is unaffected by later valueOf monkey-patching", async () => {
  const clipboard = { writeText(value) { String(value); return Promise.resolve(); } };
  const env = makeEnvironment(clipboard);
  env.install();
  env.evaluate('globalThis.valueOfCalls = 0; String.prototype.valueOf = function () { globalThis.valueOfCalls++; return ""; };');
  const boxed = env.evaluate('new String("payload")');
  await clipboard.writeText(boxed);
  assert.equal(env.evaluate("valueOfCalls"), 0);
  assert.deepEqual(env.notices, ["copy"]);
});

test("native event confirmation before deferred API fulfillment still deduplicates once", async () => {
  const pending = deferred();
  let env;
  const clipboard = { writeText() { env.document.execCommand("copy"); return pending.promise; } };
  env = makeEnvironment(clipboard);
  env.install();
  env.select("selected");
  const result = clipboard.writeText("payload");
  env.clock.flush();
  assert.deepEqual(env.notices, ["copy"]);
  pending.resolve("fulfilled");
  assert.equal(await result, "fulfilled");
  assert.deepEqual(env.notices, ["copy"]);
});

test("separate operations keep their own confirmations when promises fulfill out of order", async () => {
  const first = deferred(), second = deferred();
  const clipboard = { writeText(text) { return text === "first" ? first.promise : second.promise; } };
  const env = makeEnvironment(clipboard);
  env.install();
  const firstResult = clipboard.writeText("first");
  const secondResult = clipboard.writeText("second");
  second.resolve("second complete");
  await secondResult;
  assert.deepEqual(env.notices, ["copy"]);
  first.resolve("first complete");
  await firstResult;
  assert.deepEqual(env.notices, ["copy", "copy"]);
});

test("sync feedback inside a nested API success can initiate a separate copy", () => {
  const clipboard = {
    write() { return "nested success"; },
    writeText(text) { if (text === "outer") this.write([{}]); return "success"; }
  };
  const env = makeEnvironment(clipboard);
  let count = 0;
  env.install(() => { if (++count === 1) clipboard.writeText("separate feedback copy"); });
  assert.equal(clipboard.writeText("outer"), "success");
  assert.equal(count, 2);
});

test("known limit: asynchronous third-party fallback after stack unwind cannot be reliably correlated", async () => {
  let env;
  const clipboard = {
    async writeText() {
      await Promise.resolve();
      env.document.execCommand("copy");
      return "fulfilled third-party fallback";
    }
  };
  env = makeEnvironment(clipboard);
  env.install();
  env.select("selected");
  await clipboard.writeText("payload");
  env.clock.flush();
  // There is no operation token connecting this later event to the fulfilled wrapper.
  // A time debounce would incorrectly discard independent user copies, so this is documented.
  assert.deepEqual(env.notices, ["copy", "copy"]);
});
