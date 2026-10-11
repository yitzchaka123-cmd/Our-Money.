'use client';

import { useState, type ReactNode } from 'react';

import { RefreshButton } from '@/app/dashboard/components/RefreshButton';
import { Sheet } from '@/app/dashboard/components/Sheet';
import {
  Bank,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Filter,
  Gear,
  Menu,
  Search,
  SparkleBubble,
} from '@/app/dashboard/components/icons';
import { Cards, LogOut, Refresh, Wallet } from '@/app/dashboard/components/icons-extra';
import { monthLabel, monthParts } from '@/lib/money';

export function Shell({
  month,
  months,
  userName,
  lastUpdated,
  briefCount,
  onSearch,
  onFilter,
  onOpenWallets,
  children,
}: {
  month: string;
  months: string[];
  userName: string;
  lastUpdated: string | null;
  briefCount: number;
  onSearch?: () => void;
  onFilter?: () => void;
  /** The drawer's "ארנקים": opens the wallets sheet. */
  onOpenWallets?: () => void;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [monthSheetOpen, setMonthSheetOpen] = useState(false);

  // months arrive newest-first, so the *next* month sits at the lower index.
  const index = months.indexOf(month);
  const newer = index > 0 ? months[index - 1] : null;
  const older = index >= 0 && index < months.length - 1 ? months[index + 1] : null;

  return (
    <>
      <header className="appbar">
        <div className="appbar-actions">
          <button
            className="icon-btn"
            type="button"
            aria-label="תפריט"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu />
          </button>
          <button className="icon-btn" type="button" aria-label="סינון" onClick={onFilter}>
            <Filter />
          </button>
          <button className="icon-btn" type="button" aria-label="חיפוש" onClick={onSearch}>
            <Search />
          </button>
        </div>
        <button className="icon-btn" type="button" aria-label="העוזר החכם">
          <SparkleBubble />
        </button>
      </header>

      <nav className="monthnav" aria-label="ניווט בין חודשים">
        <a
          className="monthnav-arrow"
          href={older ? `/dashboard?month=${older}` : undefined}
          aria-disabled={older ? undefined : 'true'}
          aria-label="החודש הקודם"
        >
          <ChevronRight />
        </a>

        <button
          className="monthnav-title"
          type="button"
          onClick={() => setMonthSheetOpen(true)}
        >
          <span>
            {monthParts(month).name}{' '}
            <span className="monthnav-year">{monthParts(month).year}</span>
          </span>
          <ChevronDown />
        </button>

        <a
          className="monthnav-arrow"
          href={newer ? `/dashboard?month=${newer}` : undefined}
          aria-disabled={newer ? undefined : 'true'}
          aria-label="החודש הבא"
        >
          <ChevronLeft />
        </a>
      </nav>

      {children}

      <Sheet open={monthSheetOpen} onClose={() => setMonthSheetOpen(false)}>
        <MonthPicker month={month} months={months} />
      </Sheet>

      {drawerOpen ? (
        <>
          <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="תפריט">
            <DrawerContent
              userName={userName}
              lastUpdated={lastUpdated}
              briefCount={briefCount}
              onOpenWallets={
                onOpenWallets
                  ? () => {
                      setDrawerOpen(false);
                      onOpenWallets();
                    }
                  : undefined
              }
            />
          </aside>
        </>
      ) : null}
    </>
  );
}

function MonthPicker({ month, months }: { month: string; months: string[] }) {
  const [selected, setSelected] = useState(month);

  return (
    <div className="sheet-body">
      <h2 className="sheet-title">בחירת חודש התזרים:</h2>
      {months.map((option) => (
        <button
          key={option}
          className="radio-row"
          type="button"
          onClick={() => setSelected(option)}
        >
          <span>{monthLabel(option)}</span>
          <span className="radio" data-checked={option === selected} />
        </button>
      ))}
      <a
        className="btn"
        href={`/dashboard?month=${selected}`}
        style={{ marginTop: 18, marginBottom: 8 }}
      >
        הצגה
      </a>
    </div>
  );
}

/**
 * The side drawer, cut down to what the couple uses (feedback video 1, item
 * 24): the cashflow, the daily brief, accounts, wallets, settings, sync and
 * sign out. Exported for the tests.
 */
export function DrawerContent({
  userName,
  lastUpdated,
  briefCount,
  onOpenWallets,
}: {
  userName: string;
  lastUpdated: string | null;
  briefCount: number;
  onOpenWallets?: () => void;
}) {
  return (
    <>
      <div className="drawer-head">
        <div>
          <p className="drawer-name">{userName}</p>
          {lastUpdated ? <p className="drawer-updated">עדכון אחרון: {lastUpdated}</p> : null}
        </div>
        <a className="drawer-gear" href="/settings" aria-label="הגדרות">
          <Gear />
        </a>
      </div>

      <nav className="drawer-nav" aria-label="תפריט">
        <a className="drawer-link" href="/dashboard">
          <Coins />
          <span className="drawer-label">תזרים חודשי</span>
        </a>
        <a className="drawer-link" href="/daily">
          <Cards />
          <span className="drawer-label">הרייזאפ היומי</span>
          {briefCount > 0 ? <span className="drawer-badge">{briefCount}</span> : null}
        </a>
        <a className="drawer-link" href="/accounts">
          <Bank />
          <span className="drawer-label">מצב העו״ש והאשראי</span>
        </a>
        {onOpenWallets ? (
          <button className="drawer-link" type="button" onClick={onOpenWallets}>
            <Wallet />
            <span className="drawer-label">ארנקים</span>
          </button>
        ) : (
          <a className="drawer-link" href="/dashboard">
            <Wallet />
            <span className="drawer-label">ארנקים</span>
          </a>
        )}
        <a className="drawer-link" href="/settings">
          <Gear size={22} />
          <span className="drawer-label">הגדרות</span>
        </a>

        <hr className="drawer-rule" />

        <div className="drawer-link drawer-sync">
          <Refresh />
          <RefreshButton className="drawer-refresh" />
        </div>
        <form method="post" action="/api/auth/logout" className="drawer-form">
          <button className="drawer-link" type="submit">
            <LogOut />
            <span className="drawer-label">התנתקות</span>
          </button>
        </form>
      </nav>
    </>
  );
}
