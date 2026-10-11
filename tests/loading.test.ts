import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import DashboardLoading from '@/app/dashboard/loading';

describe('dashboard loading skeleton (V1-26)', () => {
  const html = renderToStaticMarkup(createElement(DashboardLoading));

  it('shows grey placeholder cards instead of a blank screen: a hero and two envelopes', () => {
    expect(html.match(/class="card skel-card skel-card--hero"/g)).toHaveLength(1);
    expect(html.match(/class="card skel-card"/g)).toHaveLength(2);
    expect(html).toContain('skel-line');
  });

  it('tells assistive tech the page is loading, without showing any text', () => {
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('טוען את התזרים');
  });
});
