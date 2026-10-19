"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, LifeBuoy, RotateCcw, X } from "lucide-react";
import { cx } from "@/components/ui";
import { useSession } from "@/lib/session";

interface Msg { role: "user" | "assistant"; content: string }

const STORE = "qr-help-chat";

/** Questions to start with, matched to the screen the person is on. */
function suggestionsFor(path: string): string[] {
  if (path.startsWith("/app/events")) return ["How do I make a wedding programme?", "How do I use my own design for the QR card?", "Why do guests see “not ready yet”?", "How do I print the QR card?"];
  if (path.startsWith("/app/qr")) return ["How do I change where my QR code goes?", "How do I add my logo to a code?", "Can I delete a QR code?", "What do the scan stats show?"];
  if (path.startsWith("/app/menus")) return ["How do I create a menu?", "How do I mark an item sold out?", "How do I put my menu on a QR code?"];
  if (path.startsWith("/app/billing")) return ["What do I get on Pro?", "How do I pay with mobile money?", "What happens when my plan ends?"];
  return ["How do I create a QR code?", "How do I make a funeral programme?", "How many QR codes do I have left?", "How do I upgrade my plan?"];
}

export function HelpAssistant() {
  const { org } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  // Keep the conversation while moving between pages (this browser tab only).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-20)));
    } catch {
      /* storage unavailable */
    }
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);
  useEffect(() => {
    if (open) setTimeout(() => field.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setError(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/help/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: ctrl.signal,
        body: JSON.stringify({ messages: history.slice(-12).map((m) => ({ ...m, content: m.content.slice(0, 2000) })), page: pathname, orgId: org.id }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "The assistant couldn't answer. Try again.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: answer }]);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setMessages(history);
      setError(e instanceof Error ? e.message : "The assistant couldn't answer. Try again.");
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  function reset() {
    abort.current?.abort();
    setMessages([]);
    setError(null);
    setBusy(false);
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-ink py-2.5 pr-4 pl-3 text-sm font-medium text-white shadow-lg transition-transform hover:-translate-y-0.5 sm:right-6 sm:bottom-6"
          aria-label="Open help"
        >
          <LifeBuoy className="size-5" /> Help
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Help assistant"
          className="fixed inset-0 z-50 flex flex-col bg-surface sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(620px,calc(100vh-6rem))] sm:w-[400px] sm:rounded-xl sm:border sm:border-line sm:shadow-[0_24px_60px_-12px_rgba(20,32,27,0.35)]"
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <LifeBuoy className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold leading-tight">Help</p>
              <p className="truncate text-xs text-muted">Ask how to do anything in QR Platform</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={reset} className="rounded-md p-1.5 text-muted hover:bg-sunk hover:text-ink" aria-label="Start a new conversation" title="New conversation">
                <RotateCcw className="size-4" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-muted hover:bg-sunk hover:text-ink" aria-label="Close help">
              <X className="size-5" />
            </button>
          </header>

          <div ref={list} className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted">Hi! Ask me how to create codes, build an event page, set up a menu or manage your plan. Try one of these:</p>
                <div className="grid gap-2">
                  {suggestionsFor(pathname).map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)} className="rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-accent hover:bg-accent-soft/50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <p key={i} className="ml-10 justify-self-end rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm whitespace-pre-wrap text-white">
                      {m.content}
                    </p>
                  ) : (
                    <div key={i} className="mr-6 text-sm leading-relaxed text-ink">
                      {m.content ? <Markdown text={m.content} onNavigate={() => window.innerWidth < 640 && setOpen(false)} /> : <Typing />}
                    </div>
                  ),
                )}
                {error && <p className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="border-t border-line p-3"
          >
            <div className="flex items-end gap-2 rounded-lg border border-line bg-surface p-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
              <textarea
                ref={field}
                rows={1}
                value={input}
                maxLength={2000}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                placeholder="Ask a question…"
                aria-label="Your question"
                className="max-h-30 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-faint focus-visible:outline-none"
              />
              <button type="submit" disabled={!input.trim() || busy} aria-label="Send" className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-white disabled:opacity-40">
                <ArrowUp className="size-4" />
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-faint">Answers come from the user guide and can be wrong. Check before acting on anything important.</p>
          </form>
        </div>
      )}
    </>
  );
}

function Typing() {
  return (
    <span className="inline-flex gap-1 py-2" aria-label="Writing an answer">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

/** Tiny, safe markdown: paragraphs, lists, **bold** and links to pages inside the app. */
function Markdown({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="grid gap-2.5">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isOl = lines.every((l) => /^\s*\d+[.)]\s/.test(l) || /^\s{2,}/.test(l));
        const isUl = lines.every((l) => /^\s*[-*•]\s/.test(l) || /^\s{2,}/.test(l));
        if (isOl || isUl) {
          const items = lines.filter((l) => /^\s*(\d+[.)]|[-*•])\s/.test(l)).map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s+/, ""));
          const Tag = isOl ? "ol" : "ul";
          return (
            <Tag key={i} className={cx("grid gap-1 pl-5", isOl ? "list-decimal" : "list-disc")}>
              {items.map((it, j) => (
                <li key={j}><Inline text={it} onNavigate={onNavigate} /></li>
              ))}
            </Tag>
          );
        }
        if (/^#{1,4}\s/.test(block)) return <p key={i} className="font-semibold"><Inline text={block.replace(/^#+\s*/, "")} onNavigate={onNavigate} /></p>;
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l} onNavigate={onNavigate} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function Inline({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const bold = /^\*\*([^*]+)\*\*$/.exec(p);
        if (bold) return <strong key={i} className="font-semibold">{bold[1]}</strong>;
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
        if (link) {
          // Only links to pages inside the app; anything else shows as plain text.
          return /^\/app(\/[\w\-/?=&]*)?$/.test(link[2]) ? (
            <Link key={i} href={link[2]} onClick={onNavigate} className="font-medium text-accent underline underline-offset-2">
              {link[1]}
            </Link>
          ) : (
            <span key={i}>{link[1]}</span>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
