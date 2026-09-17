'use client';

import { useState, type ReactNode } from 'react';

import { RefreshButton } from '@/app/dashboard/components/RefreshButton';
import { Sheet } from '@/app/dashboard/components/Sheet';
import {
  Bank,
  Chart,
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
import { monthLabel, monthParts } from '@/lib/money';

export function Shell({
  month,
  months,
  userName,
  lastUpdated,
  briefCount,
  children,
}: {
  month: string;
  months: string[];
  userName: string;
  lastUpdated: string | null;
  briefCount: number;
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
          <button className="icon-btn" type="button" aria-label="סינון">
            <Filter />
          </button>
          <button className="icon-btn" type="button" aria-label="חיפוש">
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

function DrawerContent({
  userName,
  lastUpdated,
  briefCount,
}: {
  userName: string;
  lastUpdated: string | null;
  briefCount: number;
}) {
  return (
    <>
      <div className="drawer-head">
        <div>
          <p className="drawer-name">{userName}</p>
          {lastUpdated ? <p className="drawer-updated">עדכון אחרון: {lastUpdated}</p> : null}
        </div>
        <span className="drawer-gear">
          <Gear />
        </span>
      </div>

      <a className="drawer-link" href="/dashboard">
        <Coins />
        <span>תזרים חודשי</span>
      </a>
      <div className="drawer-link">
        <Chart />
        <RefreshButton className="drawer-refresh" />
      </div>
      <a className="drawer-link" href="/accounts">
        <Bank />
        <span>מצב העו״ש והאשראי</span>
      </a>
      <a className="drawer-link" href="/daily">
        <Chart />
        <span>המזומן היומי</span>
        <span className="drawer-chip">חדש!</span>
        {briefCount > 0 ? <span className="drawer-badge">{briefCount}</span> : null}
      </a>
    </>
  );
}
