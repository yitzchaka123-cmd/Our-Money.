'use client';

import { Fragment, useEffect, useRef, useState, useTransition, type FormEvent } from 'react';

import { ChevronRight, Close } from '@/app/dashboard/components/icons';
import {
  ArrowLeft,
  History,
  NewChat,
  Plus,
  SendArrow,
  Sparkle,
} from '@/app/dashboard/components/topbar-icons';
import { askAssistant, listAssistantChats, openAssistantChat } from '@/lib/assistant/actions';
import { parseAnswer, type Run } from '@/lib/assistant/format';
import { MAX_QUESTION_LENGTH, type ChatTurn } from '@/lib/assistant/prompt';
import type { ChatSummary } from '@/lib/assistant/store';

export const SUGGESTIONS = [
  'כמה הוצאנו על אוכל בחוץ החודש?',
  'כמה מזומן יש לנו עכשיו?',
  'איך החודש נראה מול הקודם?',
  'על מה הוצאנו הכי הרבה החודש?',
];

const INTRO_KEY = 'our-money:assistant-intro-dismissed';

export interface AssistantPreview {
  view?: 'chat' | 'history';
  turns?: ChatTurn[];
  pending?: string | null;
  chats?: ChatSummary[];
}

/**
 * "העוזר שלנו" — RiseUp's chat sheet, answering from the household's own
 * numbers. Questions go to a server action; the answer, the chat and its
 * history are all kept on the server, per member.
 */
export function AssistantSheet({
  open,
  onClose,
  preview,
}: {
  open: boolean;
  onClose: () => void;
  /** Preview only: start in a given state, for screenshots. */
  preview?: AssistantPreview;
}) {
  const [view, setView] = useState<'chat' | 'history'>(preview?.view ?? 'chat');
  const [chatId, setChatId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>(preview?.turns ?? []);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(preview?.pending ?? null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [chats, setChats] = useState<ChatSummary[] | null>(preview?.chats ?? null);
  const [showChips, setShowChips] = useState(false);
  const [introHidden, setIntroHidden] = useState(false);
  const [, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setIntroHidden(window.localStorage.getItem(INTRO_KEY) === '1');
    } catch {
      // Storage can be blocked; the card just shows again.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pendingQuestion, error]);

  if (!open) return null;

  const busy = pendingQuestion !== null;
  const empty = turns.length === 0 && !busy;

  const ask = (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setDraft('');
    setError(null);
    setShowChips(false);
    setPendingQuestion(question);
    start(async () => {
      let result: Awaited<ReturnType<typeof askAssistant>>;
      try {
        result = await askAssistant(chatId, question);
      } catch {
        result = { ok: false, error: 'אין חיבור כרגע. בדקו את האינטרנט ונסו שוב.' };
      }
      setPendingQuestion(null);
      if (result.ok) {
        setChatId(result.chatId);
        setTurns((prev) => [
          ...prev,
          { role: 'user', content: question },
          { role: 'assistant', content: result.answer },
        ]);
        setChats(null);
      } else {
        setError(result.error);
        setDraft(question);
      }
    });
  };

  const newChat = () => {
    setChatId(null);
    setTurns([]);
    setError(null);
    setView('chat');
  };

  const openHistory = () => {
    setView('history');
    if (chats) return;
    start(async () => {
      const result = await listAssistantChats();
      if (result.ok) setChats(result.chats);
      else setError(result.error);
    });
  };

  const openChat = (id: string) => {
    setError(null);
    start(async () => {
      const result = await openAssistantChat(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChatId(id);
      setTurns(result.turns);
      setView('chat');
    });
  };

  const hideIntro = () => {
    setIntroHidden(true);
    try {
      window.localStorage.setItem(INTRO_KEY, '1');
    } catch {
      // Nothing to do: it stays hidden for this visit.
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="assistant-sheet" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
        <div className="sheet-handle" />

        <header className="assistant-head">
          {view === 'history' ? (
            <button className="assistant-title-btn" type="button" onClick={() => setView('chat')}>
              <ChevronRight size={22} />
              <h2 id="assistant-title">שיחות קודמות</h2>
            </button>
          ) : empty ? (
            <h2 className="assistant-title" id="assistant-title">
              <Sparkle className="assistant-sparkle" size={20} />
              העוזר שלנו
            </h2>
          ) : (
            <>
              <h2 className="visually-hidden" id="assistant-title">
                העוזר שלנו
              </h2>
              <button className="icon-btn" type="button" aria-label="שיחה חדשה" onClick={newChat}>
                <NewChat />
              </button>
            </>
          )}
          <div className="assistant-head-actions">
            {view === 'chat' ? (
              <button className="icon-btn" type="button" aria-label="שיחות קודמות" onClick={openHistory}>
                <History />
              </button>
            ) : null}
            <button className="icon-btn" type="button" aria-label="סגירה" onClick={onClose}>
              <Close size={24} />
            </button>
          </div>
        </header>

        <div className="assistant-body" ref={scroller}>
          {view === 'history' ? (
            <HistoryList chats={chats} onOpen={openChat} onNew={newChat} />
          ) : (
            <>
              {empty && !introHidden ? <IntroCard onDismiss={hideIntro} /> : null}

              {turns.map((turn, index) =>
                turn.role === 'user' ? (
                  <p key={index} className="chat-question">
                    {turn.content}
                  </p>
                ) : (
                  <Answer key={index} text={turn.content} />
                ),
              )}

              {pendingQuestion ? (
                <>
                  <p className="chat-question">{pendingQuestion}</p>
                  <p className="chat-thinking" role="status">
                    <Flower />
                    אני על זה...
                  </p>
                </>
              ) : null}

              {error ? (
                <p className="chat-error" role="alert">
                  {error}
                </p>
              ) : null}

              {empty || showChips ? (
                <div className="chat-chips" data-floating={!empty}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="chat-chip" type="button" onClick={() => ask(s)}>
                      <span>{s}</span>
                      <ArrowLeft />
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        <footer className="assistant-foot">
          <form className="chat-input" onSubmit={submit}>
            <button
              className="chat-plus"
              type="button"
              aria-label="הצעות לשאלות"
              aria-expanded={showChips}
              onClick={() => {
                setView('chat');
                setShowChips((v) => !v);
              }}
            >
              <Plus />
            </button>
            <input
              type="text"
              aria-label="כתוב הודעה"
              placeholder="כתוב הודעה"
              value={draft}
              maxLength={MAX_QUESTION_LENGTH}
              enterKeyHint="send"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setView('chat')}
            />
            <button className="chat-send" type="submit" aria-label="שליחה" disabled={busy || !draft.trim()}>
              <SendArrow />
            </button>
          </form>
          <p className="chat-disclaimer">העוזר עלול לטעות לפעמים. שווה לבדוק שוב מידע חשוב</p>
        </footer>
      </div>
    </>
  );
}

function IntroCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="chat-intro">
      <div className="chat-intro-art" aria-hidden="true">
        <span className="chat-intro-new">חדש!</span>
        <svg viewBox="0 0 96 96" width="96" height="96">
          <circle cx="48" cy="52" r="34" fill="#dfe4fb" />
          <path
            d="M48 24a26 26 0 1 1-19.9 42.7L23 75l10.5-3.1A26 26 0 0 1 48 24z"
            fill="#ffffff"
            stroke="#1f2a56"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path
            d="M48 33c.9 7 3.8 9.9 10.8 10.8.8.1.8 1.2 0 1.3C51.8 46 48.9 49 48 56c-.1.8-1.2.8-1.3 0-.9-7-3.8-9.9-10.8-10.9-.8-.1-.8-1.2 0-1.3C42.9 42.9 45.8 40 46.7 33c.1-.8 1.2-.8 1.3 0z"
            fill="#f04e8c"
          />
          <circle cx="66" cy="30" r="3" fill="#8d93f7" />
          <circle cx="27" cy="36" r="2" fill="#8d93f7" />
        </svg>
      </div>
      <div className="chat-intro-text">
        <h3>שאלה על הכסף? העוזר על זה!</h3>
        <p>העוזר מכיר את התזרים, המעטפות והמזומן שלכם, ועונה רק לפי המספרים האמיתיים.</p>
        <button className="chat-intro-ok" type="button" onClick={onDismiss}>
          הבנתי, תודה
        </button>
      </div>
    </section>
  );
}

function Answer({ text }: { text: string }) {
  return (
    <div className="chat-answer">
      {parseAnswer(text).map((block, i) =>
        block.kind === 'paragraph' ? (
          <p key={i}>
            <Runs runs={block.runs} />
          </p>
        ) : (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Runs runs={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((run, i) => (
        <Fragment key={i}>{run.bold ? <strong>{run.text}</strong> : run.text}</Fragment>
      ))}
    </>
  );
}

function HistoryList({
  chats,
  onOpen,
  onNew,
}: {
  chats: ChatSummary[] | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  if (chats === null) {
    return (
      <p className="chat-thinking" role="status">
        <Flower />
        טוען שיחות...
      </p>
    );
  }
  return (
    <>
      <button className="chat-history-new" type="button" onClick={onNew}>
        <NewChat size={22} />
        <span>שיחה חדשה</span>
      </button>
      {chats.length === 0 ? (
        <p className="chat-history-empty">עוד אין שיחות קודמות. שאלו משהו והשיחה תישמר כאן.</p>
      ) : (
        <ul className="chat-history">
          {chats.map((chat) => (
            <li key={chat.id}>
              <button type="button" onClick={() => onOpen(chat.id)}>
                <span className="chat-history-title">{chat.title}</span>
                <span className="chat-history-date">{shortWhen(chat.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The lilac flower beside "אני על זה...". */
function Flower() {
  return (
    <svg className="chat-flower" width="22" height="22" viewBox="0 0 30 30" aria-hidden="true">
      <g fill="#a9a6f6">
        <circle cx="10" cy="10" r="7.6" />
        <circle cx="20" cy="10" r="7.6" />
        <circle cx="10" cy="20" r="7.6" />
        <circle cx="20" cy="20" r="7.6" />
      </g>
    </svg>
  );
}

function shortWhen(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '');
}
