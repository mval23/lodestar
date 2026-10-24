import { render, screen, within } from '@testing-library/react';
import { Comparison } from './Comparison';
import { PaceCapsule } from './PaceCapsule';
import { StandsOut } from './StandsOut';

describe('Comparison', () => {
  it('shows the signed difference and what it compares with', () => {
    const { container } = render(<Comparison delta={-45483} currency="USD" against="vs a typical Sep 1–24" />);
    // The amount is printed, and spoken in full for screen readers.
    expect(container).toHaveTextContent('−$454.83');
    expect(container).toHaveTextContent('minus $454.83 vs a typical Sep 1–24');
  });
});

describe('PaceCapsule', () => {
  it('fills to the share spent and puts the pace tick where today should be', () => {
    const { container } = render(<PaceCapsule spent={38043} planned={55000} pace={44000} />);
    const bar = container.querySelector('.prog i') as HTMLElement;
    expect(bar.style.width).toBe(`${(38043 / 55000) * 100}%`);
    expect((container.querySelector('.pace-tick') as HTMLElement).style.left).toBe('80%');
    expect(container.querySelector('.prog.over')).toBeNull();
  });

  it('hatches past the plan instead of overflowing', () => {
    const { container } = render(<PaceCapsule spent={8247} planned={8000} pace={6400} />);
    expect(container.querySelector('.prog.over')).not.toBeNull();
    expect((container.querySelector('.prog i') as HTMLElement).style.width).toBe('100%');
  });

  it('has no tick without a pace, as for a goal', () => {
    const { container } = render(<PaceCapsule spent={260000} planned={400000} tone="save" />);
    expect(container.querySelector('.pace-tick')).toBeNull();
    expect(container.querySelector('.prog.spend')).toBeNull();
  });
});

describe('StandsOut', () => {
  it('reads its sentences with the amounts in full', () => {
    render(
      <StandsOut
        currency="USD"
        findings={[{ key: 'out', weight: 1, parts: ['Money out is ', { minor: 45483 }, ' below a typical Sep 1–24.'] }]}
      />,
    );
    expect(screen.getByText(/What stands out/)).toBeInTheDocument();
    expect(screen.getByText(/below a typical Sep 1–24/)).toBeInTheDocument();
    expect(screen.getAllByText('$454.83').length).toBeGreaterThan(0);
  });

  it('says nothing when nothing stands out', () => {
    const { container } = render(<StandsOut currency="USD" findings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RangeBar', () => {
  it('places the figure in its range, and grows the range to reach a figure outside it', async () => {
    const { RangeBar } = await import('./RangeBar');
    const { container, rerender } = render(<RangeBar value={29977} low={26630} high={41339} typical={35152} currency="USD" />);
    expect(container).toHaveTextContent(/\$266\.30.*low.*typical.*\$351\.52.*\$413\.39.*high/);
    const now = container.querySelector('.range-now') as HTMLElement;
    expect(Number(now.style.left.replace('%', ''))).toBeCloseTo(((29977 - 26630) / (41339 - 26630)) * 100, 5);
    rerender(<RangeBar value={50000} low={26630} high={41339} typical={35152} currency="USD" />);
    expect((container.querySelector('.range-now') as HTMLElement).style.left).toBe('100%');
  });
});

describe('donutSlices', () => {
  it('steps through the spectrum largest first, gathers the rest, and hatches no category', async () => {
    const { donutSlices } = await import('./CategoryDonut');
    const items = [10, 90, 80, 70, 60, 50, 40, 35, 30, 20, 0].map((n, i) => ({ key: `k${i}`, label: `Cat ${n}`, minor: n * 100 }));
    const slices = donutSlices([...items, { key: 'none', label: 'Uncategorized', minor: 5000, uncategorized: true }]);
    expect(slices.map((s) => s.tone)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 'none']);
    expect(slices.slice(0, 2).map((s) => s.label)).toEqual(['Cat 90', 'Cat 80']);
    // 30 + 20 + 10, three categories; the empty one is left out.
    expect(slices[7]).toMatchObject({ label: 'Everything else', minor: 6000, count: 3 });
  });

  it('names an eighth category itself rather than gathering one alone', async () => {
    const { donutSlices } = await import('./CategoryDonut');
    const slices = donutSlices([8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({ key: `k${n}`, label: `Cat ${n}`, minor: n })));
    expect(slices).toHaveLength(8);
    expect(slices[7]).toMatchObject({ label: 'Cat 1', tone: 's8' });
  });
});

describe('MoneySplit', () => {
  it('splits one bar by amount and names every part with its share', async () => {
    const { MoneySplit } = await import('./SplitBar');
    const { container } = render(
      <MoneySplit
        label="Where the money in went"
        currency="USD"
        shareOf="of money in"
        parts={[
          { label: 'Spent', minor: 300000, tone: 'out' },
          { label: 'Into goals', minor: 100000, tone: 'in' },
          { label: 'Kept', minor: 0, tone: 'base' },
        ]}
      />,
    );
    const parts = Array.from(container.querySelectorAll('.money-split-part')) as HTMLElement[];
    // Nothing kept, so no empty sliver for it.
    expect(parts.map((p) => p.style.flexGrow)).toEqual(['300000', '100000']);
    const keys = within(screen.getByRole('group', { name: 'Where the money in went' })).getAllByRole('listitem');
    expect(keys[0]).toHaveTextContent(/Spent.*\$3,000\.00.*75% of money in/);
    expect(keys[1]).toHaveTextContent(/Into goals.*\$1,000\.00.*25% of money in/);
    expect(container.querySelector('.money-split-beyond')).toBeNull();
  });

  it('hatches what went past the money in, and names it', async () => {
    const { MoneySplit } = await import('./SplitBar');
    const { container } = render(
      <MoneySplit
        label="Where the money in went"
        currency="USD"
        shareOf="of what went out"
        parts={[
          { label: 'Spent', minor: 300000, tone: 'out' },
          { label: 'Into goals', minor: 100000, tone: 'in' },
        ]}
        limit={350000}
        extra={[{ label: 'From balances', minor: 50000, tone: 'short' }]}
      />,
    );
    expect((container.querySelector('.money-split-beyond') as HTMLElement).style.left).toBe('87.5%');
    expect(screen.getByText('From balances').closest('li')).toHaveTextContent(/\$500\.00.*12\.5% of what went out/);
  });
});
